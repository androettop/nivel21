<div align="center">

<!-- Header SVG -->
<a id="logo">
 <img src="header.svg" alt="Nivel21" style="width: 100%; height: auto;" />
</a>

### Extensión para navegador que mejora tu experiencia en **Nivel20**

Añade funcionalidades útiles para DMs y jugadores de D&D.

</div>

## 📦 Instalación

1. Clona este repositorio o descárgalo como ZIP
2. Abre tu navegador y ve a `chrome://extensions/` (Chrome) o `about:debugging#/runtime/this-firefox` (Firefox)
3. Activa el "Modo de desarrollador" (Chrome)
4. En chrome, haz clic en "Cargar extensión sin empaquetar" y selecciona la carpeta de la extensión, o en Firefox haz clic en "Cargar complemento temporal" y selecciona el archivo `manifest.json`
5. ¡Listo! La extensión está activa en Nivel20



## Características

### Tiradas con Ventaja/Desventaja

Modifica automáticamente tus tiradas de dados manteniendo presionadas las teclas especiales mientras haces clic en un botón de tirada.

- **Shift** - Tirada con Ventaja
- **Alt** - Tirada con Desventaja

![Tiradas con Ventaja/Desventaja](popup/img/advantage-disadvantage.png)

---

### Mediciones Persistentes

Mantén tus mediciones en el mapa de forma persistente. Usa el botón de anclaje en el panel de mediciones para activar o desactivar este modo.

- **Botón Toggle** - Activa/desactiva la persistencia de mediciones

![Mediciones Persistentes](popup/img/multi-measurement.png)

---

### Compartir Contenido al Chat

Comparte rápidamente conjuros, items, reglas y otros contenidos con tu DM y compañeros. Los elementos se resaltan en azul cuando están listos para compartir.

- **Shift + Click** - Comparte el elemento al chat

![Compartir Contenido al Chat](popup/img/send-to-chat.png)

---

### Enlaces en Mensajes del Chat

Los enlaces de reglas, objetos, conjuros y otros contenidos de Nivel20 se detectan automáticamente en el chat y se abren en ventanas internas.

- **Auto** - Los enlaces se convierten automáticamente al escribirlos

![Enlaces en Mensajes del Chat](popup/img/parse-chat-links.png)

---

### Atajos para Tokens

Controla rápidamente los tokens/fichas del mapa usando atajos de teclado. Selecciona un token primero para activar estos atajos:

| Tecla | Acción |
|-------|--------|
| **H** | Alternar visibilidad del token |
| **B** | Bloquear/desbloquear el token |
| **E** | Editar el token seleccionado |
| **D** | Duplicar el token seleccionado |
| **Delete** | Eliminar el token seleccionado |

![Atajos para Tokens](popup/img/token-hotkeys.png)

---

## Contribuciones

Las contribuciones son bienvenidas. Si encuentras un bug o tienes una sugerencia de mejora, siéntete libre de abrir un issue o enviar un pull request.
