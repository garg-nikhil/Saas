export function meta() {
  return [
    { title: "SaaS Factory" },
    { name: "description", content: "Build localized SaaS products faster." },
  ];
}

export async function loader() {
  return {
    renderedAt: new Date().toISOString(),
  };
}

export default function Home() {
  return (
    <main className="container" id="home-view">
      <div className="card" id="home-card">
        <h1 id="home-title">SaaS Factory</h1>
        <p className="subtitle" id="home-subtitle">
          Build localized SaaS products faster.
        </p>
        <div className="button-group" id="home-actions">
          <a href="/login" className="btn btn-primary" id="btn-login">
            Login
          </a>
          <a href="/signup" className="btn btn-secondary" id="btn-signup">
            Create account
          </a>
        </div>
      </div>
    </main>
  );
}
