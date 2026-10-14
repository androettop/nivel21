# Pendientes — eoy-update

## Funcionalidades

- [x] **Temporizador de turno**: el DM define segundos por turno. Lo ven todos (viaja en los mensajes de orden de turnos); se reinicia al cambiar de turno; al llegar a 0 solo cambia visualmente.
- [x] **Auras con forma personalizable**: formas (círculo, cuadrado, rectángulo…) para terreno difícil, zonas de daño, rango de trampas.
- [ ] **Ventana de recursos de criaturas**: casillas personalizables (conjuros, rasgos, acciones) por criatura, guardadas localmente en el navegador del DM.
- [ ] **Consumibles como equipo**: plantillas locales reutilizables → crear el objeto en el inventario real vía Nivel20; contador de cantidad en el servidor; número de cantidad sobre los objetos en la ventana de inventario (estilo WoW).
- [x] **Marco de personaje**: esquina superior izquierda, personaje seleccionado (misma lógica para DM y jugadores). Retrato → hoja; vida → desplegable con curación/daño/temporal; CA; salvación de concentración al recibir daño; recursos compactos (click gasta, click derecho recarga).
- [ ] **Menú contextual en el panel de inventario**: click derecho en cada objeto → sumar/restar cantidad, eliminar; editar dinero. Usar las mismas llamadas a la API que las vistas del personaje.
- [ ] **Efectos ambientales animados**: lluvia, nubes, tormenta, etc.; capa liviana sobre el canvas.
- [ ] **Barra de vida sobre los tokens**: el DM en todos los tokens asignados; los jugadores solo en los que ven en su panel.
- [ ] **Estado invisible**: según la CONDICIÓN «Invisible» del personaje/criatura (no el invisible nativo del DM): ocultar el token a quienes no ven al personaje/criatura en su panel (solo del lado del cliente). Quienes sí lo ven, lo ven semitransparente con un iconito que indica que es invisible por la condición (no por el invisible del DM).
- [ ] **Formulario mejorado de la barra de acciones**: árbol multinivel, arrastrar y soltar, carpetas de la extensión (acciones, conjuros, inventario…) reordenables/activables, ajuste por personaje al guardar.

## Cierre
- [ ] Revisar dependencias entre features: declararlas y desactivar automáticamente las que dependan de una feature desactivada.
- [ ] Capturas con Playwright para README y popup
- [ ] Documentación en README + entradas del popup

## Notas / limitaciones
- Temporizador: el historial del chat no tiene marcas de tiempo, así que al recargar la página la cuenta regresiva del turno actual se reinicia. Se sincroniza con `/turno tiempo N` (los clientes sin soporte lo ignoran).
- Auras: las formas nuevas (rectángulo, cono, línea, «solo aura») usan un formato de etiqueta extendido (`[a:color-tamaño-…]`); las versiones anteriores de la extensión no las muestran. Los círculos mantienen el formato original. «Solo aura» oculta el token a los jugadores con la extensión (el DM lo ve semitransparente); sin la extensión el token se ve normal.
- Interno: `EditTokenUIManager.setTokenTag` edita el token *seleccionado* (usa el formulario nativo), no el `networkId` recibido; las features siempre lo llaman desde el menú contextual del token, donde coincide.
