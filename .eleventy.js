const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addGlobalData("buildTime", () =>
    new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  );

  // "2026-05-14" → "May 14, 2026"
  eleventyConfig.addFilter("dateFormat", (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  });

  // "2026-05-14" → "May 14"
  eleventyConfig.addFilter("dateFormatShort", (dateStr) => {
    const [, m, d] = dateStr.split("-").map(Number);
    return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
  });

  // "2026-05-14" → "14"
  eleventyConfig.addFilter("dateDay", (dateStr) => {
    return parseInt(dateStr.split("-")[2], 10);
  });

  // games[] → [{month: "May 2026", games: [...]}, ...]
  eleventyConfig.addFilter("groupByMonth", (games) => {
    const sorted = [...games].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    const map = new Map();
    for (const game of sorted) {
      const [y, m] = game.releaseDate.split("-").map(Number);
      const key = `${MONTHS[m - 1]} ${y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(game);
    }
    return Array.from(map, ([month, games]) => ({ month, games }));
  });

  // top N games by hype across the whole list
  eleventyConfig.addFilter("topN", (games, n) =>
    [...games].sort((a, b) => (b.hype || 0) - (a.hype || 0)).slice(0, n)
  );

  eleventyConfig.addFilter("topHype", (games) => {
    if (!games || games.length === 0) return null;
    return [...games].sort((a, b) => (b.hype || 0) - (a.hype || 0))[0];
  });

  eleventyConfig.addFilter("exceptId", (games, id) =>
    games.filter(g => g.id !== id)
  );

  // [{month, games: topN by hype}] — one entry per month
  eleventyConfig.addFilter("topPerMonth", (games, n) => {
    const sorted = [...games].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    const map = new Map();
    for (const game of sorted) {
      const [y, m] = game.releaseDate.split("-").map(Number);
      const key = `${MONTHS[m - 1]} ${y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(game);
    }
    return Array.from(map, ([month, list]) => ({
      month,
      games: [...list].sort((a, b) => (b.hype || 0) - (a.hype || 0)).slice(0, n || 3)
    }));
  });

  eleventyConfig.addFilter("allGenres", (games) => {
    const set = new Set();
    games.forEach(g => (g.genres || []).forEach(genre => set.add(genre)));
    return [...set].sort();
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
};
