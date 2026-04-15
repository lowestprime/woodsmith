import { cosineSimilarity, createTextEmbeddings, getAiServiceStatus } from "@/lib/ai-services";
import {
  getEmbeddingCache,
  listMedia,
  listPages,
  listPieces,
  listPosts,
  listProjects,
  saveEmbeddingCache,
  searchSite as lexicalSearchSite,
  type SearchResult
} from "@/lib/db";

type SearchCandidate = SearchResult & {
  text: string;
  embeddingKey?: string;
};

function candidateText(result: Omit<SearchCandidate, "score"> & { score?: number }) {
  return [result.title, result.summary, result.text].join("\n");
}

function buildCandidates(includePrivate: boolean): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];

  for (const piece of listPieces(true)) {
    if (!includePrivate && piece.publicationStatus !== "published") {
      continue;
    }
    candidates.push({
      id: piece.slug,
      type: "piece",
      title: piece.title,
      href: `/portfolio/${piece.slug}`,
      summary: piece.summary,
      score: 0,
      private: piece.publicationStatus !== "published",
      text: [piece.subtitle, piece.category, piece.story, piece.details.join(" "), piece.tags.join(" "), piece.materials.join(" "), JSON.stringify(piece.metadata)].join(" "),
      embeddingKey: `piece:${piece.slug}`
    });
  }

  for (const post of listPosts(true)) {
    if (!includePrivate && post.publicationStatus !== "published") {
      continue;
    }
    candidates.push({
      id: post.slug,
      type: "post",
      title: post.title,
      href: `/process/${post.slug}`,
      summary: post.excerpt,
      score: 0,
      private: post.publicationStatus !== "published",
      text: [post.body, post.tags.join(" "), post.sourceLabel ?? "", post.sourceUrl ?? ""].join(" "),
      embeddingKey: `post:${post.slug}`
    });
  }

  for (const page of listPages(true)) {
    if (!includePrivate && page.status !== "published") {
      continue;
    }
    candidates.push({
      id: page.slug,
      type: "page",
      title: page.title,
      href: page.slug === "home" ? "/" : `/${page.slug}`,
      summary: page.intro,
      score: 0,
      private: page.status !== "published",
      text: [page.body, page.layout].join(" "),
      embeddingKey: `page:${page.slug}`
    });
  }

  if (includePrivate) {
    for (const media of listMedia({ includeUnreviewed: true, limit: 500 })) {
      const aiTags = Array.isArray(media.metadata.aiTags) ? media.metadata.aiTags.map(String) : [];
      const aiDescription = typeof media.metadata.aiDescription === "string" ? media.metadata.aiDescription : "";
      candidates.push({
        id: media.relativePath,
        type: "media",
        title: media.fileName,
        href: `/media/${media.relativePath}`,
        summary: media.altText || aiDescription || media.relativePath,
        score: 0,
        private: true,
        text: [media.relativePath, media.folder, media.clusterKey, media.tags.join(" "), aiTags.join(" "), aiDescription, media.pieceSlug ?? "", media.postSlug ?? "", media.pageSlug ?? "", JSON.stringify(media.metadata)].join(" "),
        embeddingKey: `media:${media.relativePath}`
      });
    }

    for (const project of listProjects(true)) {
      candidates.push({
        id: project.reference,
        type: "project",
        title: `${project.reference} · ${project.guestName}`,
        href: `/studio?panel=projects&project=${project.reference}`,
        summary: project.brief,
        score: 0,
        private: true,
        text: [project.guestEmail, project.materials.join(" "), project.stage, project.status, JSON.stringify(project.estimator), JSON.stringify(project.options)].join(" "),
        embeddingKey: `project:${project.reference}`
      });
    }
  }

  return candidates;
}

async function getQueryEmbedding(query: string): Promise<number[] | null> {
  const cacheKey = `query:${query.trim().toLowerCase().slice(0, 200)}`;
  const cached = getEmbeddingCache(cacheKey);
  if (cached?.embedding?.length) return cached.embedding;

  const embeddings = await createTextEmbeddings([query]).catch(() => null);
  if (!embeddings?.[0]?.length) return null;

  saveEmbeddingCache({
    key: cacheKey,
    kind: "query",
    embedding: embeddings[0],
    sourceText: query
  });

  return embeddings[0];
}

function rerankWithCachedEmbeddings(queryEmbedding: number[], candidates: SearchCandidate[]): SearchCandidate[] {
  return candidates.map((candidate) => {
    if (!candidate.embeddingKey) return candidate;
    const cached = getEmbeddingCache(candidate.embeddingKey);
    if (!cached?.embedding?.length) return candidate;

    const similarity = cosineSimilarity(queryEmbedding, cached.embedding);
    const embeddingScore = Math.round(Math.max(0, similarity) * 100);
    return { ...candidate, score: Math.max(candidate.score, embeddingScore) };
  });
}

export async function searchSite(query: string, includePrivate = false): Promise<{ results: SearchResult[]; embeddingEnabled: boolean; visualSearchEnabled: boolean }> {
  const lexicalResults = lexicalSearchSite(query, includePrivate);
  const status = getAiServiceStatus();
  if (!status.embeddingSearch || !query.trim()) {
    return { results: lexicalResults, embeddingEnabled: false, visualSearchEnabled: false };
  }

  const candidates = buildCandidates(includePrivate).slice(0, 200);
  const queryEmbedding = await getQueryEmbedding(query);

  if (!queryEmbedding) {
    return { results: lexicalResults, embeddingEnabled: false, visualSearchEnabled: false };
  }

  const cachedReranked = rerankWithCachedEmbeddings(queryEmbedding, candidates);
  const cachedHits = cachedReranked.filter((candidate) => candidate.score >= 18);

  const uncachedCandidates = cachedReranked.filter((candidate) => {
    if (!candidate.embeddingKey) return true;
    return !getEmbeddingCache(candidate.embeddingKey);
  });

  let freshEmbeddingHits: SearchCandidate[] = [];

  if (uncachedCandidates.length > 0 && uncachedCandidates.length <= 80) {
    const texts = uncachedCandidates.map(candidateText);
    const embeddings = await createTextEmbeddings(texts).catch(() => null);
    if (embeddings?.length === uncachedCandidates.length) {
      freshEmbeddingHits = uncachedCandidates
        .map((candidate, index) => {
          const embedding = embeddings[index];
          if (candidate.embeddingKey && embedding?.length) {
            saveEmbeddingCache({
              key: candidate.embeddingKey,
              kind: candidate.type,
              embedding,
              sourceText: texts[index] ?? ""
            });
          }
          return {
            ...candidate,
            score: Math.round(Math.max(0, cosineSimilarity(queryEmbedding, embedding ?? [])) * 100)
          };
        })
        .filter((candidate) => candidate.score >= 18);
    }
  }

  const byKey = new Map<string, SearchResult>();
  for (const result of [...lexicalResults, ...cachedHits, ...freshEmbeddingHits]) {
    const key = `${result.type}:${result.id}`;
    const existing = byKey.get(key);
    if (!existing || result.score > existing.score) {
      byKey.set(key, {
        id: result.id,
        type: result.type,
        title: result.title,
        href: result.href,
        summary: result.summary,
        score: result.score,
        private: result.private
      });
    }
  }

  return {
    results: [...byKey.values()].sort((left, right) => right.score - left.score || left.title.localeCompare(right.title)).slice(0, 60),
    embeddingEnabled: true,
    visualSearchEnabled: status.mediaAnalysis
  };
}

export async function visualSearchByImageTags(tags: string[], includePrivate = false): Promise<SearchResult[]> {
  const query = tags.join(" ");
  const { results } = await searchSite(query, includePrivate);
  return results;
}
