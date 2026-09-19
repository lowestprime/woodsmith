import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AvatarBadge } from "@/components/avatar-badge";
import {
  PageIntro,
  PageSection,
  PieceCard,
  PostCard,
  Shell,
} from "@/components/site-chrome";
import {
  listPublicWoodworkers,
  getPublicResourceWoodworker,
  listPieces,
  listPosts,
} from "@/lib/db";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params,
    worker = listPublicWoodworkers().find((item) => item.slug === slug);
  return worker
    ? { title: worker.business_name, description: worker.bio.slice(0, 160) }
    : { title: "Woodshop not found" };
}
export default async function WoodworkerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();
  const { slug } = await params,
    worker = listPublicWoodworkers().find((item) => item.slug === slug);
  if (!worker) notFound();
  const pieces = listPieces().filter(
    (piece) =>
      getPublicResourceWoodworker("piece", piece.slug)?.id === worker.id,
  );
  const posts = listPosts().filter(
    (post) => getPublicResourceWoodworker("post", post.slug)?.id === worker.id,
  );
  return (
    <Shell>
      <PageSection>
        <Link href="/woodworkers">All woodshops</Link>
        <AvatarBadge
          avatarPath={worker.avatar_path}
          label={worker.business_name.slice(0, 2)}
          seed={worker.id}
          variant="editor"
        />
        <PageIntro
          eyebrow="Woodshop"
          title={worker.business_name}
          copy={worker.bio}
        />
        <h2>Work</h2>
        {pieces.length ? (
          <div className="piece-grid portfolio-grid">
            {pieces.map((piece, index) => (
              <PieceCard key={piece.slug} piece={piece} order={index} />
            ))}
          </div>
        ) : (
          <p>New work is being prepared for the portfolio.</p>
        )}
        {posts.length ? (
          <>
            <h2>Process</h2>
            <div className="page-grid">
              {posts.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          </>
        ) : null}
      </PageSection>
    </Shell>
  );
}
