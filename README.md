# Xochi · Generadores (versión GitHub Pages + Google Sheets)

Versión estática pensada para subir a GitHub Pages. La "base de datos" es un
Google Sheet tuyo, así que:

- **Persiste de verdad**: no depende del navegador de cada usuario ni de un
  servidor que tengas que mantener corriendo.
- **La puedes descargar cuando quieras**: es un Google Sheet — abres
  `Archivo > Descargar > Microsoft Excel (.xlsx)` o CSV y tienes todo el
  historial. La app también trae dos botones (JSON y CSV) por si quieres
  una copia rápida sin salir de la página.
- **Cualquier usuario puede acceder**: GitHub Pages es público (o puedes
  restringirlo a tu organización si usas GitHub Enterprise).

## Paso 1 — Crea el Google Sheet

1. Ve a [sheets.new](https://sheets.new) y crea una hoja nueva.
2. Nómbrala, por ejemplo, **"Xochi - Generadores - Base de datos"**.
3. No crees ninguna pestaña manualmente — el script las crea solas
   (`Diaria`, `Semanal`, `Ajustes`) la primera vez que alguien guarda algo.

## Paso 2 — Pega el script

1. En el Sheet: **Extensiones > Apps Script**.
2. Borra el contenido de `Código.gs` y pega todo el contenido de
   [`Code.gs`](./Code.gs) de esta carpeta.
3. Guarda (ícono de disco o Ctrl+S).

## Paso 3 — Publica como Web App

1. En el editor de Apps Script: **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:
   - **Ejecutar como**: Yo (tu cuenta) — así el script escribe en el Sheet
     con tus permisos, sin pedirle cuenta de Google a cada usuario.
   - **Quién tiene acceso**: **Cualquier usuario** — para que la página
     pública en GitHub Pages pueda llamarlo sin login.
4. Haz clic en **Implementar**. Google va a pedirte autorizar el script la
   primera vez (es tuyo, dale "Avanzado > Ir a [nombre del proyecto]").
5. Copia la **URL de la aplicación web** que te da (termina en `/exec`).

> Cada vez que edites `Code.gs` después de esto, tienes que volver a
> **Implementar > Gestionar implementaciones > ✎ > Nueva versión** para que
> los cambios se apliquen a esa misma URL.

## Paso 4 — Conecta el frontend

Abre `config.js` en esta carpeta y pega la URL:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
```

## Paso 5 — Sube a GitHub Pages

```bash
git init
git add .
git commit -m "Checklist de generadores"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

Luego en el repo: **Settings > Pages > Source: main branch**. En un par de
minutos queda publicado en `https://TU_USUARIO.github.io/TU_REPO/`.

## Cómo queda la persistencia

Cada "Guardar" en la app hace un `POST` al Apps Script, que agrega una fila
al Sheet en el momento — no hay caché intermedio ni botón de sincronizar.
El Sheet mismo es tu respaldo permanente; puedes editarlo, filtrarlo o
descargarlo directamente ahí sin tocar la app.

## Límites a tener en cuenta

- Apps Script tiene una cuota diaria generosa pero no infinita (para este
  volumen de uso — 4 generadores, un par de inspecciones al día — está muy
  por debajo del límite).
- Solo tú (el dueño del script) puede editar `Code.gs`; si quieres que otra
  persona lo mantenga, comparte el Sheet como editor.
- Si en algún momento el volumen de datos crece mucho o necesitas
  reportes más pesados, la migración natural es a la versión con backend
  propio (Express + base de datos) que ya tienes en la otra carpeta del
  proyecto.

## Archivos de esta carpeta

```
├── Code.gs         # Pega esto en Apps Script (no se sube a GitHub Pages)
├── config.js        # Tu URL de Apps Script — el único archivo que editas
├── index.html
├── styles.css
├── app.js
└── README.md
```


`Code.gs` puedes dejarlo en el repo como referencia/respaldo del código,
aunque GitHub Pages no lo ejecuta — solo vive activo dentro de Apps Script.
