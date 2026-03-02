(async () => {
  try {
    /* =======================
       Feature: Error Report
    ======================= */

    const { loadManagers } = window._n21_;

    const [MainMenuUIManager, FloatingPanelManager, SettingsManager] =
      await loadManagers(
        "MainMenuUIManager",
        "FloatingPanelManager",
        "SettingsManager"
      );

    const PANEL_TITLE = "Informe de Errores";
    const PANEL_ICON = "ft-alert-triangle";
    const PANEL_COLOR = "#dc3545";
    const PANEL_CLASS = "n21-error-report-panel";
    const PANEL_STYLE = "min-height: 500px; width: 750px; height: 600px;";

    // Check if there are any errors to report
    function hasErrors() {
      const errors = window._n21_.errors;
      return errors.managers.size > 0 || errors.features.size > 0;
    }

    // Generate markdown report
    function generateErrorReport() {
      const errors = window._n21_.errors;
      const clientVersion = window.vttConfig?.version || "desconocida";
      
      let report = "# Informe de Errores - Nivel 21 Plugin\n\n";
      report += `**Fecha:** ${new Date().toLocaleString("es-ES")}\n`;
      report += `**Versión del cliente:** ${clientVersion}\n\n`;

      if (errors.managers.size > 0) {
        report += "## Managers con errores\n\n";
        for (const [name, message] of errors.managers) {
          report += `### ${name}\n`;
          report += "```\n";
          report += message;
          report += "\n```\n\n";
        }
      }

      if (errors.features.size > 0) {
        report += "## Features con errores\n\n";
        for (const [name, message] of errors.features) {
          report += `### ${name}\n`;
          report += "```\n";
          report += message;
          report += "\n```\n\n";
        }
      }

      return report;
    }

    // Escape HTML for safe rendering
    function escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }

    // Show error report panel
    function showErrorReport() {
      const report = generateErrorReport();
      const escapedReport = escapeHtml(report);
      
      const html = `
        <div style="padding: 20px; height: 100%; display: flex; flex-direction: column;">
          <p style="margin-bottom: 15px;">
            Se detectaron errores al cargar algunos módulos del plugin. 
            Puedes enviar este informe al canal de reportes de errores 
            de la comunidad de Discord de Nivel21 y se solucionará lo antes posible.
          </p>
          
          <textarea 
            class="n21-error-report-content" 
            readonly 
            style="flex: 1; width: 100%; font-family: monospace; font-size: 12px; 
                   padding: 10px; border-radius: 4px; 
                   resize: vertical; min-height: 200px;"
          >${escapedReport}</textarea>
          
          <div style="margin-top: 15px; text-align: right;">
            <button 
              class="n21-copy-error-report btn btn-primary" 
              style="padding: 8px 16px;"
            >
              Copiar al portapapeles
            </button>
          </div>
        </div>
      `;

      const $panel = FloatingPanelManager.openStaticPanelWithHtml(
        PANEL_TITLE,
        PANEL_ICON,
        PANEL_COLOR,
        html,
        PANEL_CLASS,
        PANEL_STYLE
      );

      if (!$panel || !$panel.length) return;

      const $copyButton = $panel.find(".n21-copy-error-report");
      const $textarea = $panel.find(".n21-error-report-content");

      if ($copyButton.length && $textarea.length) {
        $copyButton.on("click", async function() {
          const textarea = $textarea[0];
          try {
            await navigator.clipboard.writeText(textarea.value);
            $copyButton.text("Copiado!");
            $copyButton.addClass("btn-success").removeClass("btn-primary");
            
            setTimeout(() => {
              $copyButton.text("Copiar al portapapeles");
              $copyButton.addClass("btn-primary").removeClass("btn-success");
            }, 2000);
          } catch (err) {
            // Fallback for older browsers
            textarea.select();
            document.execCommand("copy");
            $copyButton.text("Copiado!");
            $copyButton.addClass("btn-success").removeClass("btn-primary");
            
            setTimeout(() => {
              $copyButton.text("Copiar al portapapeles");
              $copyButton.addClass("btn-primary").removeClass("btn-success");
            }, 2000);
          }
        });
      }
    }

    // Add menu option only if there are errors
    if (hasErrors()) {
      const header = await MainMenuUIManager.addHeader("Nivel 21", {
        id: "n21-menu-header",
      });

      await MainMenuUIManager.addItem(
        {
          id: "error-report",
          title: "Informe de Errores",
          iconClass: PANEL_ICON,
          order: 9999, // Show at the end
          onClick: () => {
            showErrorReport();
          },
        },
        {
          afterElement: header,
        }
      );
    }

    // Also check periodically in case errors are added after initial load
    setInterval(async () => {
      if (hasErrors()) {
        const menu = document.querySelector("#main-menu-navigation");
        const existingItem = menu?.querySelector('[data-n21-id="error-report"]');
        if (!existingItem) {
          const header = await MainMenuUIManager.addHeader("Nivel 21", {
            id: "n21-menu-header",
          });

          await MainMenuUIManager.addItem(
            {
              id: "error-report",
              title: "Informe de Errores",
              iconClass: PANEL_ICON,
              order: 9999,
              onClick: () => {
                showErrorReport();
              },
            },
            {
              afterElement: header,
            }
          );
        }
      }
    }, 5000); // Check every 5 seconds

  } catch (error) {
    // Don't register this error to avoid infinite loops
    console.error("N21: Error crítico en feature Error Report:", error);
  }
})();
