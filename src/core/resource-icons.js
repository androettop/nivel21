(() => {
  /* =======================================================================
       Shared resource icons

       Recognizes standard D&D resources by their name (case and accent
       insensitive, Spanish and English) and assigns each one an icon (a
       bundled SVG under src/assets/resources/, from game-icons.net) and a
       color. Used wherever a resource is shown compactly (character frame…).

       Exposed as `window._n21_.resourceIcons`.
    ======================================================================= */

  // First match wins, so more specific names go first. Keywords are compared
  // against the normalized resource name (lowercase, no accents).
  const RESOURCES = [
    { key: "legendary-resistance", color: "#d9a520", keywords: ["resistencia legendaria", "legendary resistance"] },
    { key: "legendary-actions", color: "#d9a520", keywords: ["acciones legendarias", "accion legendaria", "legendary action"] },
    { key: "rage", color: "#d0342a", keywords: ["furia", "rage"] },
    { key: "channel-divinity", color: "#e8c547", keywords: ["canalizar divinidad", "canalizar la divinidad", "channel divinity"] },
    { key: "bardic-inspiration", color: "#b072d6", keywords: ["inspiracion bardica", "inspiracion de bardo", "bardic inspiration"] },
    { key: "heroic-inspiration", color: "#f2d16b", keywords: ["inspiracion heroica", "heroic inspiration", "inspiracion"] },
    { key: "focus", color: "#3cc0a8", keywords: ["puntos de ki", "ki points", "puntos de concentracion", "puntos de disciplina", "focus points", "puntos de foco", "ki"] },
    { key: "sorcery", color: "#e0559a", keywords: ["puntos de hechiceria", "sorcery points", "fuente de magia", "font of magic"] },
    { key: "wild-shape", color: "#4caf50", keywords: ["forma salvaje", "wild shape", "forma animal"] },
    { key: "second-wind", color: "#5dade2", keywords: ["tomar aliento", "nuevas energias", "segundo aliento", "recuperar aliento", "second wind"] },
    { key: "action-surge", color: "#e67e22", keywords: ["oleada de accion", "accion subita", "action surge"] },
    { key: "lay-on-hands", color: "#f5d76e", keywords: ["imposicion de manos", "lay on hands"] },
    { key: "superiority", color: "#a3b1bf", keywords: ["dados de superioridad", "dado de superioridad", "superiority"] },
    { key: "indomitable", color: "#8e9aa6", keywords: ["indomable", "indomitable"] },
    { key: "luck", color: "#58c26b", keywords: ["puntos de suerte", "afortunado", "suerte", "lucky", "luck"] },
    { key: "breath-weapon", color: "#f06a2b", keywords: ["arma de aliento", "aliento de dragon", "breath weapon", "aliento"] },
    { key: "divine-sense", color: "#e8c547", keywords: ["sentido divino", "divine sense"] },
    { key: "arcane-recovery", color: "#5b8def", keywords: ["recuperacion arcana", "arcane recovery"] },
    { key: "hit-dice", color: "#c0392b", keywords: ["dados de golpe", "dados de vida", "dados de puntos de golpe", "hit dice"] },
    { key: "favored-enemy", color: "#6ab04c", keywords: ["enemigo predilecto", "enemigo favorito", "favored enemy", "marca del cazador"] },
    { key: "recharge", color: "#c9ced6", keywords: ["recarga", "recharge"] },
  ];

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function iconUrl(key) {
    const base = document.documentElement?.dataset?.n21BaseUrl || "";
    return `${base}src/assets/resources/${key}.svg`;
  }

  /**
   * Find the standard resource a name refers to.
   * @param {string} name
   * @returns {{key: string, color: string, iconUrl: string}|null}
   */
  function match(name) {
    const text = ` ${normalize(name)} `;
    if (!text.trim()) return null;
    const found = RESOURCES.find((resource) =>
      resource.keywords.some((keyword) => text.includes(` ${keyword} `)),
    );
    return found ? { key: found.key, color: found.color, iconUrl: iconUrl(found.key) } : null;
  }

  window._n21_.resourceIcons = { RESOURCES, match, iconUrl };
})();
