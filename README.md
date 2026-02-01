<div align="center">

<!-- Header SVG -->
<a id="logo">
 <img src="header.svg" alt="Nivel21" style="width: 100%; height: auto;" />
</a>

### Extensión para navegador que mejora tu experiencia en **Nivel20**

Añade funcionalidades útiles para DMs y jugadores de D&D.

</div>

> **Aviso:** Esta extensión no es oficial ni está afiliada a Nivel20. Es un proyecto independiente de la comunidad.

## Instalación

1. Clona este repositorio o [descárgalo como ZIP](https://github.com/androettop/nivel21/archive/refs/heads/master.zip)
2. Abre tu navegador y ve a `chrome://extensions/` (Chrome) o `about:debugging#/runtime/this-firefox` (Firefox)
3. Activa el "Modo de desarrollador" (Chrome)
4. En chrome, haz clic en "Cargar extensión sin empaquetar" y selecciona la carpeta de la extensión, o en Firefox haz clic en "Cargar complemento temporal" y selecciona el archivo `manifest.json`
5. ¡Listo! La extensión está activa en Nivel20

## Actualización

1. Descarga el nuevo ZIP de la extensión (o actualiza tu copia local).
2. **Chrome**: ve a `chrome://extensions/` y presiona el icono de **Actualizar** en la extensión. Si no aparece, elimínala y vuelve a cargarla.
3. **Firefox**: ve a `about:debugging#/runtime/this-firefox` y presiona en el icono **Recargar** en la extensión. Si no aparece, elimínala y vuelve a cargar el `manifest.json`.

## Características

> **Aviso:** Estas características dependen del funcionamiento interno de Nivel20 y pueden dejar de funcionar con futuras actualizaciones.

### Tiradas con Ventaja/Desventaja

Modifica automáticamente tus tiradas de dados manteniendo presionadas las teclas especiales mientras haces clic en un botón de tirada.

- **Shift** - Tirada con Ventaja
- **Alt** - Tirada con Desventaja

<a id="advantage-disadvantage">
<img src="popup/img/advantage-disadvantage.png" alt="Tiradas con Ventaja/Desventaja" />
</a>

---

### Mediciones Persistentes

Mantén tus mediciones en el mapa de forma persistente. Usa el botón de anclaje en el panel de mediciones para activar o desactivar este modo.

- **Botón Toggle** - Activa/desactiva la persistencia de mediciones

<a id="multi-measurement">
 <img src="popup/img/multi-measurement.png" alt="Mediciones Persistentes" />
</a>

---

### Compartir Contenido al Chat

Comparte rápidamente conjuros, items, reglas y otros contenidos con tu DM y compañeros. Los elementos se resaltan en azul cuando están listos para compartir.

- **Shift + Click** - Comparte el elemento al chat

<a id="send-to-chat">
 <img src="popup/img/send-to-chat.png" alt="Compartir Contenido al Chat" />
</a>

---

### Enlaces en Mensajes del Chat

Los enlaces de reglas, objetos, conjuros y otros contenidos de Nivel20 se detectan automáticamente en el chat y se abren en ventanas internas.

- **Auto** - Los enlaces se convierten automáticamente al escribirlos

<a id="parse-chat-links">
 <img src="popup/img/parse-chat-links.png" alt="Enlaces en Mensajes del Chat" />
</a>

---

### Atajos para Tokens

Controla rápidamente los tokens/fichas del mapa usando atajos de teclado. Selecciona un token primero para activar estos atajos:

| Tecla        | Acción                         |
| ------------ | ------------------------------ |
| **Ctrl + H** | Alternar visibilidad del token |
| **Ctrl + B** | Bloquear/desbloquear el token  |
| **Ctrl + E** | Editar el token seleccionado   |
| **Ctrl + D** | Duplicar el token seleccionado |
| **Delete**   | Eliminar el token seleccionado |

<a id="token-hotkeys">
 <img src="popup/img/token-hotkeys.png" alt="Atajos para Tokens" />
</a>

---

### Altura de Tokens

Permite ajustar la altura de uno o varios tokens seleccionados para colocarlos encima o debajo de otros.

| Tecla         | Acción                      |
| ------------- | --------------------------- |
| **Page Up**   | Subir altura del token (+1) |
| **Page Down** | Bajar altura del token (-1) |

<a id="token-height-order">
 <img src="popup/img/token-height-order.png" alt="Altura de Tokens" />
</a>

---

### Ajustar a la Cuadrícula

Mantén presionado Shift al mover tokens para forzarlos a ajustarse a la cuadrícula automáticamente.

| Tecla                 | Acción                        |
| --------------------- | ----------------------------- |
| **Shift + Arrastrar** | Ajustar token a la cuadrícula |

<a id="snap-to-grid">
 <img src="popup/img/snap-to-grid.png" alt="Ajustar a la Cuadrícula" />
</a>

---

## Contribuciones

Las contribuciones son bienvenidas. Si encuentras un bug o tienes una sugerencia de mejora, siéntete libre de abrir un issue o enviar un pull request.

## Apoya el Proyecto

Si te ha sido útil esta extensión, considera apoyar el proyecto:

<a href="https://ko-fi.com/androettop" target="_blank">
    <img src="popup/img/kofi.png" alt="Apoya el proyecto en Ko-fi" height="48" />
</a>
