# Plantilla de WhatsApp: `daily_summary`

Crear en **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**, dos veces (misma plantilla, dos idiomas).

- **Categoría:** Marketing. Meta rechaza este contenido como Utilidad: un resumen diario al que te suscribes no va ligado a un pedido ni a una cuenta.
- **Nombre:** `daily_summary`
- **Idiomas:** Español (`es`). El inglés (`en`) queda aparcado de momento.
- **Tipo de encabezado:** ninguno

---

## Español (`es`)

**Cuerpo:**

```
Buenos días. Hoy en {{1}}: {{2}} respecto a lo normal (máx {{3}}, lo normal {{4}}).

{{5}}

Toca el botón para ver el detalle.
```

**Pie de página:**

```
Responde BAJA para dejar de recibirlo
```

**Botón:** Llamada a la acción → Visitar sitio web
- Texto del botón: `Ver detalle`
- Tipo de URL: **Dinámica**
- URL: `https://jnozaleda.github.io/TempTrack/web/app/?{{1}}`

**Ejemplos que pide Meta:**

| Variable | Ejemplo |
|---|---|
| {{1}} | Madrid |
| {{2}} | +7° |
| {{3}} | 32° |
| {{4}} | 25° |
| {{5}} | Septiembre se ha creído que es julio. Agua y sombra. |
| URL {{1}} | `c=Madrid&lat=40.4168&lon=-3.7038&l=es&src=wa` |

---

## English (`en`)

**Body:**

```
Good morning. Today in {{1}}: {{2}} vs normal (high {{3}}, usually {{4}}).

{{5}}

Tap the button for the full picture.
```

**Footer:**

```
Reply STOP to unsubscribe
```

**Button:** Call to action → Visit website
- Button text: `See details`
- URL type: **Dynamic**
- URL: `https://jnozaleda.github.io/TempTrack/web/app/?{{1}}`

**Samples:**

| Variable | Sample |
|---|---|
| {{1}} | London |
| {{2}} | +5° |
| {{3}} | 23° |
| {{4}} | 18° |
| {{5}} | Sleeves are officially optional today. |
| URL {{1}} | `c=London&lat=51.5085&lon=-0.1257&l=en&src=wa` |

---

## Por qué está hecha así

- El cuerpo empieza y acaba con texto fijo, y los números van dentro de una frase: Meta rechaza plantillas que empiezan o acaban con una variable o que son casi solo variables.
- La frase canalla va en {{5}}: la genera el envío diario con el mismo banco de frases que la web y la app. En una variable no puede haber saltos de línea; nuestras frases no los tienen.
- El texto fijo es neutro a propósito: Meta revisa la plantilla, no cada valor que luego se envía.
- La URL dinámica solo permite la variable al final, por eso toda la parte de ciudad, idioma y `src=wa` va en esa variable.

## Aceptación

- [ ] `daily_summary` en Español: estado **Activa / Aprobada**
- [ ] (Aparcado) `daily_summary` en Inglés: estado **Activa / Aprobada**
- [ ] Un envío de prueba llega a tu WhatsApp con el botón "Ver detalle", y al tocarlo se abre la web de la ciudad con el idioma correcto
