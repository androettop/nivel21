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
- [x] **Estado invisible**: según el estado «Invisible» del personaje/criatura (no el invisible nativo del DM): ocultar el token a quienes no ven al personaje/criatura en su panel (solo del lado del cliente). Quienes sí lo ven, lo ven semitransparente con el ícono del estado (feature «Estados en los tokens»).
- [x] **Formulario mejorado de la barra de acciones**: árbol multinivel, arrastrar y soltar, carpetas de la extensión (acciones, conjuros, inventario…) reordenables/activables, ajuste por personaje al guardar.
- [x] **Ping rápido**: además del menú contextual, doble click de la ruedita o tecla F (donde apunta el cursor), con el mismo debounce del ping.

## Cierre
- [x] Revisar dependencias entre features: declararlas y desactivar automáticamente las que dependan de una feature desactivada.
- [x] Capturas con Playwright para README y popup
- [x] Documentación en README + entradas del popup

## Notas / limitaciones
- Temporizador: el historial del chat no tiene marcas de tiempo, así que al recargar la página la cuenta regresiva del turno actual se reinicia. Los segundos viajan dentro del mensaje del orden de turnos (`tiempo:N`), sin mensajes extra; versiones viejas de la extensión verían una fila «??» extra.
- Auras: las formas nuevas (rectángulo, cono, línea, «solo aura») usan un formato de etiqueta extendido (`[a:color-tamaño-…]`); las versiones anteriores de la extensión no las muestran. Los círculos mantienen el formato original. «Solo aura» oculta el token a los jugadores con la extensión (el DM lo ve semitransparente); sin la extensión el token se ve normal.
- Interno: `EditTokenUIManager.setTokenTag` edita el token *seleccionado* (usa el formulario nativo), no el `networkId` recibido; las features siempre lo llaman desde el menú contextual del token, donde coincide.
- Barras de vida / invisible: un token se vincula con [char:id]. Si varios tokens apuntan al mismo grupo de criaturas («2 x Goblin»), se reparten entre las instancias en orden de networkId (igual en todos los clientes).
- Inventario: el JSON de la hoja no trae ids de objetos; se cruzan con los enlaces Editar/Eliminar de la página del personaje por nombre y orden. Las ediciones usan los formularios nativos (se carga el formulario y solo se cambia el campo necesario).
- Permisos: vida, recursos y estados solo se editan si el usuario puede abrir el modal nativo (barra de vida `.editable`); inventario/dinero, si la hoja le muestra los formularios.
- Clima animado: viaja en el mismo comando `/ambient-fx <color> <opacidad> <fusión> [clima] [intensidad]` (un solo mensaje; solo del DM). La vista previa también muestra el clima. Cada usuario puede desactivarlo en Ajustes > Avanzado (equipos lentos). Hecho con texturas tileables generadas una vez (sin archivos): por frame solo 2–3 rellenos con patrón; sigue a la cámara (paneo/rotación/zoom; lluvia/nieve/brasas escalan en saltos para mantenerse legibles). 30 fps, pausa con la pestaña oculta; con «reducir movimiento» va más lento y sin destellos.
- Nivel20 tiene un WAF (AWS) que responde 202 vacío si se hacen muchas requests seguidas (pasó durante las pruebas). Para no dispararlo, todas las requests de la extensión pasan por una cola compartida (máx. 2 a la vez y 350 ms entre cada una); el JSON y la página de la hoja se cachean hasta que se edita algo, el catálogo de estados se descarga una sola vez, las ediciones se debouncean y el inventario se recarga una sola vez tras varias ediciones. Si aun así el firewall responde, se reintenta con esperas crecientes.
- Editor de barra: el primer nivel se guarda como carpetas nativas; los niveles siguientes como nombres «Sub > Acción» (+ «Sin acción» con el nombre de la subcarpeta para su icono). Las carpetas de Nivel21 pueden tener icono mediante una acción «Sin acción» con su mismo nombre. Orden/visibilidad de carpetas de Nivel21, acciones por defecto y armas: por personaje en el navegador. También se corrigió que la barra multinivel mostraba acciones ocultas con «Acciones a ocultar».
- Dependencias: barras de vida, estados en tokens e Invisible requieren «Asignar tokens a personajes»; el editor de la barra requiere «Carpetas anidadas». Si falta una dependencia la feature se desactiva sola y el panel de configuración lo indica.
- [x] **Lanzar conjuros**: botón «Lanzar» (icono del conjuro) primero en los conjuros con ataque/daño; los conjuros sin tiradas se lanzan con su propio botón. Envía un mensaje al chat y, si es de concentración, activa el estado Concentración (también con sus botones de ataque y al usar conjuros de curación/utilidad de concentración). Carpetas renombradas a «Conjuros de nivel N» con iconos de número romano.
- [x] **Inventario**: botón de editar que abre el equipo en la hoja (URL de la campaña).
