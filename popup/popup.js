document.addEventListener("DOMContentLoaded", () => {
  // Navegación por tabs entre la vista principal y la de características.
  const viewHome = document.getElementById("view-home");
  const viewFeatures = document.getElementById("view-features");
  const tabs = Array.from(document.querySelectorAll(".tab"));

  const showView = (view) => {
    viewHome.hidden = view !== "home";
    viewFeatures.hidden = view !== "features";
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === view;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    window.scrollTo(0, 0);
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.tab));
  });

  // Acordeón de características: colapsadas por defecto, solo una abierta a la vez.
  const features = Array.from(document.querySelectorAll(".feature"));

  const collapse = (feature) => {
    feature.classList.remove("open");
    const header = feature.querySelector(".feature-header");
    const body = feature.querySelector(".feature-body");
    if (header) header.setAttribute("aria-expanded", "false");
    if (body) body.style.maxHeight = null;
  };

  const expand = (feature) => {
    feature.classList.add("open");
    const header = feature.querySelector(".feature-header");
    const body = feature.querySelector(".feature-body");
    if (header) header.setAttribute("aria-expanded", "true");
    if (body) body.style.maxHeight = body.scrollHeight + "px";
  };

  features.forEach((feature) => {
    const header = feature.querySelector(".feature-header");
    if (!header) return;

    header.addEventListener("click", () => {
      const isOpen = feature.classList.contains("open");
      // Cerrar todas las demás antes de abrir esta.
      features.forEach((f) => collapse(f));
      if (!isOpen) {
        expand(feature);
        feature.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });

    // Recalcular la altura de la sección abierta cuando carguen las imágenes.
    feature.querySelectorAll("img").forEach((img) => {
      img.addEventListener("load", () => {
        if (feature.classList.contains("open")) expand(feature);
      });
    });
  });
});
