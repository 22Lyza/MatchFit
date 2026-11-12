
function App() {
  return (
    <main>
      <header className="header">
        <h1>MATCH<span>FIT</span></h1>
        <p>YOUR SPORT. YOUR COMMUNITY.</p>
      </header>

      <section className="welcome">
        <h2>Bienvenue dans ta communauté.</h2>
        <p>Partage tes performances. Inspire les autres.</p>
      </section>

      <section className="feed">
        <h2>Actualités sportives</h2>
        <div className="empty-feed">
          <span>🏋️</span>
          <h3>Ton aventure commence ici.</h3>
          <p>Les publications sportives apparaîtront ici.</p>
        </div>
      </section>
    </main>
  )
}

export default App
