import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { AvatarBadge } from "@/components/avatar-badge";
import { inlineEditAttrs } from "@/components/inline-editable";
import { readAvatarGradient } from "@/lib/avatar";
import { getPage, getSiteSettings, listPublicProfiles } from "@/lib/db";

export const metadata: Metadata = {
  title: "About",
  description: "About Beaman Woodworks: the woodworkers, the workshop, and the craft behind every piece.",
  openGraph: { title: "About | Beaman Woodworks", description: "Meet the woodworkers behind Beaman Woodworks." }
};

export default async function AboutPage() {
  await connection();
  const page = getPage("about");
  const site = getSiteSettings();
  const profiles = listPublicProfiles();
  const socialLinks = site.socialLinks.filter((item) => item.url && item.label.toLowerCase() !== "github");

  return (
    <Shell>
      <PageSection editHref="/studio?panel=pages&page=about#page-about">
        <PageIntro eyebrow="About" title={page?.title ?? "About & Contact"} copy={page?.intro ?? "Meet William Beaman, the maker behind the furniture."} targets={{ title: { resource: "page", id: "about", field: "title" }, copy: { resource: "page", id: "about", field: "intro" } }} />
        {page?.body ? <p className="page-body-copy" {...inlineEditAttrs({ resource: "page", id: "about", field: "body" })}>{page.body}</p> : null}
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article className="profile-card" key={profile.email}>
              <AvatarBadge
                avatarPath={profile.avatarPath}
                className="profile-photo placeholder-photo profile-photo-gradient"
                gradient={readAvatarGradient(profile.metadata)}
                imageClassName="profile-photo"
                label={profile.displayName.split(" ").filter(Boolean).map((part) => part[0]).join("")}
                seed={profile.email || profile.displayName}
              />
              <div>
                <p className="eyebrow" {...inlineEditAttrs({ resource: "user", id: profile.email, field: "headline" })}>{profile.headline}</p>
                <h2 {...inlineEditAttrs({ resource: "user", id: profile.email, field: "displayName" })}>{profile.displayName}</h2>
                <p {...inlineEditAttrs({ resource: "user", id: profile.email, field: "bio" })}>{profile.bio}</p>
                <div className="share-links">
                  {profile.links.map((link) => <a href={link.url} key={link.url} rel="noreferrer" target="_blank">{link.label}</a>)}
                  {profile.email ? <a href={`mailto:${profile.email}`}>{profile.email}</a> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection editHref="/studio?panel=settings" id="contact">
        <div className="contact-grid">
          <article className="studio-panel">
            <h2>Business contact</h2>
            <p>{site.builderName} · {site.builderHeadline}</p>
            <p><a href={`mailto:${site.builderEmail}`}>{site.builderEmail}</a></p>
            <p className="muted-copy">For available work, custom builds, delivery, care, or repair.</p>
            <Link className="button-primary" href="/contact">Send an inquiry</Link>
          </article>
          {socialLinks.length > 0 ? <article className="studio-panel">
            <h2>Follow the woodshop</h2>
            <div className="footer-links">
              {socialLinks.map((item) => <a href={item.url} key={item.label} rel="noreferrer" target="_blank">{item.label}</a>)}
            </div>
          </article> : null}
        </div>
      </PageSection>
    </Shell>
  );
}
