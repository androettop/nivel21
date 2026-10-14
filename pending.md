# Pendientes — eoy-update

## Funcionalidades

- [x] **Temporizador de turno**: el DM define segundos por turno. Lo ven todos (viaja en los mensajes de orden de turnos); se reinicia al cambiar de turno; al llegar a 0 solo cambia visualmente.
- [x] **Auras con forma personalizable**: formas (círculo, cuadrado, rectángulo…) para terreno difícil, zonas de daño, rango de trampas.
- [x] **Ventana de recursos de criaturas**: casillas personalizables (conjuros, rasgos, acciones) por criatura, guardadas localmente en el navegador del DM.
- [x] **Consumibles / cantidad**: (sin menú de plantillas, a pedido) la cantidad se edita en cualquier objeto del inventario; se guarda como `[qty:N]` al final de la descripción (nunca borra texto; si no hay espacio no se escribe) y se muestra como número sobre el objeto (estilo WoW).
- [x] **Marco de personaje**: esquina superior izquierda, personaje seleccionado (misma lógica para DM y jugadores). Retrato → hoja; vida → desplegable con curación/daño/temporal; CA; salvación de concentración al recibir daño; recursos compactos (click gasta, click derecho recarga).
- [x] **Menú contextual en el panel de inventario**: click derecho en cada objeto → sumar/restar cantidad, eliminar; editar dinero. Usar las mismas llamadas a la API que las vistas del personaje.
- [x] **Efectos ambientales animados**: lluvia, nubes, tormenta, etc.; capa liviana sobre el canvas.
- [x] **Barra de vida sobre los tokens**: el DM en todos los tokens asignados; los jugadores solo en los que ven en su panel.
- [x] **Estado invisible**: según la ESTADO «Invisible» del personaje/criatura (no el invisible nativo del DM): ocultar el token a quienes no ven al personaje/criatura en su panel (solo del lado del cliente). Quienes sí lo ven, lo ven semitransparente con un iconito que indica que es invisible por el estado (no por el invisible del DM).
- [ ] **Formulario mejorado de la barra de acciones**: árbol multinivel, arrastrar y soltar, carpetas de la extensión (acciones, conjuros, inventario…) reordenables/activables, ajuste por personaje al guardar.

## Cierre
- [ ] Revisar dependencias entre features: declararlas y desactivar automáticamente las que dependan de una feature desactivada.
- [ ] Capturas con Playwright para README y popup
- [ ] Documentación en README + entradas del popup

## Notas / limitaciones
- Temporizador: el historial del chat no tiene marcas de tiempo, así que al recargar la página la cuenta regresiva del turno actual se reinicia. Los segundos viajan dentro del mensaje del orden de turnos (`tiempo:N`), sin mensajes extra; versiones viejas de la extensión verían una fila «??» extra.
- Auras: las formas nuevas (rectángulo, cono, línea, «solo aura») usan un formato de etiqueta extendido (`[a:color-tamaño-…]`); las versiones anteriores de la extensión no las muestran. Los círculos mantienen el formato original. «Solo aura» oculta el token a los jugadores con la extensión (el DM lo ve semitransparente); sin la extensión el token se ve normal.
- Interno: `EditTokenUIManager.setTokenTag` edita el token *seleccionado* (usa el formulario nativo), no el `networkId` recibido; las features siempre lo llaman desde el menú contextual del token, donde coincide.
- Barras de vida / invisible: un token se vincula con [char:id]. Si varios tokens apuntan al mismo grupo de criaturas («2 x Goblin»), se reparten entre las instancias en orden de networkId (igual en todos los clientes).
- Inventario: el JSON de la hoja no trae ids de objetos; se cruzan con los enlaces Editar/Eliminar de la página del personaje por nombre y orden. Las ediciones usan los formularios nativos (se carga el formulario y solo se cambia el campo necesario).
- Permisos: vida, recursos y estados solo se editan si el usuario puede abrir el modal nativo (barra de vida `.editable`); inventario/dinero, si la hoja le muestra los formularios.
- Clima animado: viaja en el mismo comando `/ambient-fx <color> <opacidad> <fusión> [clima] [intensidad]` (un solo mensaje; solo del DM). La vista previa también muestra el clima. Cada usuario puede desactivarlo en Ajustes > Avanzado (equipos lentos). Hecho con texturas tileables generadas una vez (sin archivos): por frame solo 2–3 rellenos con patrón; sigue a la cámara (paneo/rotación/zoom; lluvia/nieve/brasas escalan en saltos para mantenerse legibles). 30 fps, pausa con la pestaña oculta; con «reducir movimiento» va más lento y sin destellos.
