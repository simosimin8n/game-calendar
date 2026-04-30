module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

  // Date in italiano (formato lungo: "14 maggio 2026")
  eleventyConfig.addFilter("dataIt", function(dateString) {
    if (!dateString) return "TBA";
    const d = new Date(dateString);
    const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                  "luglio","agosto","settembre","ottobre","novembre","dicembre"];
    return `${d.getDate()} ${mesi[d.getMonth()]} ${d.getFullYear()}`;
  });

  // Date in italiano abbreviata (formato corto: "14 mag")
  eleventyConfig.addFilter("dataItShort", function(dateString) {
    if (!dateString) return "TBA";
    const d = new Date(dateString);
    const mesi = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
    return `${d.getDate()} ${mesi[d.getMonth()]}`;
  });

  // Raggruppa giochi per mese (ordinati cronologicamente)
  eleventyConfig.addFilter("groupByMese", function(games) {
    const mesi = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                  "luglio","agosto","settembre","ottobre","novembre","dicembre"];
    const sorted = [...games].sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
    const groups = {};
    sorted.forEach(g => {
      if (!g.releaseDate) return;
      const d = new Date(g.releaseDate);
      const key = `${mesi[d.getMonth()]} ${d.getFullYear()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(g);
    });
    return Object.entries(groups).map(([mese, giochi]) => ({ mese, giochi }));
  });

  // Top hype del mese: il gioco con hype più alto (per la hero card)
  eleventyConfig.addFilter("topHype", function(games) {
    if (!games || games.length === 0) return null;
    return [...games].sort((a, b) => (b.hype || 0) - (a.hype || 0))[0];
  });

  // Tutti tranne uno specifico (per escludere la hero dalla griglia)
  eleventyConfig.addFilter("exceptId", function(games, id) {
    return games.filter(g => g.id !== id);
  });

  // Estrae tutti i generi unici (per i filtri)
  eleventyConfig.addFilter("allGenres", function(games) {
    const set = new Set();
    games.forEach(g => (g.genres || []).forEach(genre => set.add(genre)));
    return [...set].sort();
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    }
  };
};
