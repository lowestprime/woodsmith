import { PageIntro, PageSection, Shell } from "@/components/site-chrome";
import { getPage, getSiteSettings, listPublicProfiles } from "@/lib/db";
import { toMediaUrl } from "@/lib/format";

export default function AboutPage() {
  const page = getPage("about");
  const site = getSiteSettings();
  const profiles = listPublicProfiles();

  return (
    <Shell>
      <PageSection>
        <PageIntro eyebrow="About & contact" title={page?.title ?? "About & Contact"} copy={page?.intro ?? "Meet the master builder and the developer behind the platform."} />
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article className="profile-card" key={profile.email}>
              {profile.avatarPath ? <img alt={profile.displayName} className="profile-photo" src={profile.avatarPath.startsWith("profiles/") ? `/${profile.avatarPath}` : toMediaUrl(profile.avatarPath)} /> : <div className="profile-photo placeholder-photo">{profile.displayName.split(" ").map((part) => part[0]).join("")}</div>}
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

      <PageSection>
        <div className="contact-grid">
          <article className="studio-panel">
            <h2>Business contact</h2>
            <p>{site.builderName} · {site.builderHeadline}</p>
            <p><a href={`mailto:${site.builderEmail}`}>{site.builderEmail}</a></p>
            <p>{site.developerName} · {site.developerHeadline}</p>
            <p><a href={`mailto:${site.developerEmail}`}>{site.developerEmail}</a></p>
          </article>
          <article className="studio-panel">
            <h2>Social and sharing</h2>
            <div className="footer-links">
              {site.socialLinks.filter((item) => item.url).map((item) => <a href={item.url} key={item.label} rel="noreferrer" target="_blank">{item.label}</a>)}
              <a href={site.repoUrl} rel="noreferrer" target="_blank">GitHub repository</a>
            </div>
            <p className="muted-copy">Social profile URLs remain editable in the studio settings so the public about page can be updated without code changes.</p>
          </article>
        </div>
      </PageSection>
    </Shell>
  );
}
