import type { Metadata } from "next";
import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getPage, getSiteSettings, listPublicProfiles } from "@/lib/db";
import { resolveAssetUrl } from "@/lib/format";

export const metadata: Metadata = {
  title: "About",
  description: "About Beaman Woodworks: the woodworkers, the workshop, and the craft behind every piece.",
  openGraph: { title: "About | Beaman Woodworks", description: "Meet the woodworkers behind Beaman Woodworks." }
};

export default function AboutPage() {
  const page = getPage("about");
  const site = getSiteSettings();
  const profiles = listPublicProfiles();

  return (
    <Shell>
      <PageSection editHref="/studio?panel=pages&page=about#page-about">
        <PageIntro eyebrow="About & contact" title={page?.title ?? "About & Contact"} copy={page?.intro ?? "Meet the master builder and the developer behind the platform."} />
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article className="profile-card" key={profile.email}>
              {profile.avatarPath ? <img alt={profile.displayName} className="profile-photo" src={resolveAssetUrl(profile.avatarPath)} /> : <div className="profile-photo placeholder-photo">{profile.displayName.split(" ").filter(Boolean).map((part) => part[0]).join("")}</div>}
              <div>
                <p className="eyebrow">{profile.headline}</p>
                <h2>{profile.displayName}</h2>
                <p>{profile.bio}</p>
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
            <p className="muted-copy">Custom work starts with a direct note about the piece, room, intended use, and timing.</p>
            <p>{site.developerName} · {site.developerHeadline}</p>
            <p><a href={`mailto:${site.developerEmail}`}>{site.developerEmail}</a></p>
          </article>
          <article className="studio-panel">
            <h2>Social and sharing</h2>
            <div className="footer-links">
              {site.socialLinks.filter((item) => item.url).map((item) => <a href={item.url} key={item.label} rel="noreferrer" target="_blank">{item.label}</a>)}
              <a href={site.repoUrl} rel="noreferrer" target="_blank">GitHub repository</a>
            </div>
            <p className="muted-copy">Use the share tools on each piece page to send links to buyers, collaborators, or social platforms. Public profile URLs remain editable from the private dashboard.</p>
          </article>
        </div>
      </PageSection>
    </Shell>
  );
}
