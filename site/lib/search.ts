import { cosineSimilarity, createTextEmbeddings, getAiServiceStatus } from "@/lib/ai-services";
import {
  listMedia,
  listPages,
  listPieces,
  listPosts,
  listProjects,
  searchSite as lexicalSearchSite,
  type SearchResult
} from "@/lib/db";

type SearchCandidate = SearchResult & {
  text: string;
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
      text: [piece.subtitle, piece.category, piece.story, piece.details.join(" "), piece.tags.join(" "), piece.materials.join(" "), JSON.stringify(piece.metadata)].join(" ")
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
      text: [post.body, post.tags.join(" "), post.sourceLabel ?? "", post.sourceUrl ?? ""].join(" ")
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
      text: [page.body, page.layout].join(" ")
    });
  }

  if (includePrivate) {
    for (const media of listMedia({ includeUnreviewed: true })) {
      candidates.push({
        id: media.relativePath,
        type: "media",
        title: media.fileName,
        href: `/media/${media.relativePath}`,
        summary: media.altText || media.relativePath,
        score: 0,
        private: true,
        text: [media.relativePath, media.folder, media.clusterKey, media.tags.join(" "), media.pieceSlug ?? "", media.postSlug ?? "", media.pageSlug ?? "", JSON.stringify(media.metadata)].join(" ")
      });
    }

    for (const project of listProjects(true)) {
      candidates.push({
        id: project.reference,
        type: "project",
        title: `${project.reference} · ${project.guestName}`,
        href: `/studio?project=${project.reference}`,
        summary: project.brief,
        score: 0,
        private: true,
        text: [project.guestEmail, project.materials.join(" "), project.stage, project.status, JSON.stringify(project.estimator), JSON.stringify(project.options)].join(" ")
      });
    }
  }

  return candidates;
}

export async function searchSite(query: string, includePrivate = false): Promise<{ results: SearchResult[]; embeddingEnabled: boolean }> {
  const lexicalResults = lexicalSearchSite(query, includePrivate);
  const status = getAiServiceStatus();
  if (!status.embeddingSearch || !query.trim()) {
    return { results: lexicalResults, embeddingEnabled: false };
  }

  const candidates = buildCandidates(includePrivate).slice(0, 120);
  const embeddings = await createTextEmbeddings([query, ...candidates.map(candidateText)]).catch(() => null);
  if (!embeddings || embeddings.length !== candidates.length + 1) {
    return { results: lexicalResults, embeddingEnabled: false };
  }

  const queryEmbedding = embeddings[0] ?? [];
  const embeddingResults = candidates
    .map((candidate, index) => ({
      ...candidate,
      score: Math.round(Math.max(0, cosineSimilarity(queryEmbedding, embeddings[index + 1] ?? [])) * 100)
    }))
    .filter((candidate) => candidate.score >= 18);

  const byKey = new Map<string, SearchResult>();
  for (const result of [...lexicalResults, ...embeddingResults]) {
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
    embeddingEnabled: true
  };
}
