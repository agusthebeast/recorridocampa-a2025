// ====================
// Variables globales
// ====================
let map;
let busMarker;
let paradas = [];
let config = {};
let currentIndex = 0;
let isMoving = false; // evita animaciones solapadas

// Aproximación de bounds de la PBA (para encuadre y limitar vista)
const BA_BOUNDS = L.latLngBounds(
  L.latLng(-41.5, -64.5),
  L.latLng(-33.0, -56.0)
);

// ====================
// Inicialización
// ====================
async function init() {
  // Cargar config y paradas
  const confRes = await fetch("data/config.json");
  config = await confRes.json();

  const parRes = await fetch("data/paradas.json");
  paradas = await parRes.json();

  // Mapa limitado a PBA
 map = L.map("map", {
  maxBounds: BA_BOUNDS,
  maxBoundsViscosity: 1.0,
  worldCopyJump: false,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  zoomControl: false   // <- oculta el control de zoom
});


  // Base OSM
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // Ruta + encuadre
  const ruta = paradas.map(p => p.coords);
  const linea = L.polyline(ruta, { color: "#4c2882", weight: 8, opacity: 0.95 }).addTo(map);
  const rutaBounds = linea.getBounds();
  const targetBounds = BA_BOUNDS.contains(rutaBounds) ? rutaBounds : BA_BOUNDS;
  // Encudrar y LUEGO BLOQUEAR el mapa en esta vista
map.fitBounds(targetBounds, { padding: [30, 30] });

// 1) Fijar este zoom como único
const lockZoom = map.getZoom();
map.setMinZoom(lockZoom);
map.setMaxZoom(lockZoom);

// 2) Desactivar TODAS las interacciones de navegación
map.dragging.disable();
map.touchZoom.disable();
map.doubleClickZoom.disable();
map.scrollWheelZoom.disable();
map.boxZoom.disable();
map.keyboard.disable();
if (map.tap) map.tap.disable();

// 3) Limitar bounds como red de seguridad (aunque ya está fijo)
map.setMaxBounds(targetBounds);
map.options.maxBoundsViscosity = 1.0;


  // Máscara fuera de PBA (escenario)
  const WORLD_RING = [
    [-89.9, -179.9], [-89.9, 179.9], [89.9, 179.9], [89.9, -179.9]
  ];
  const b = BA_BOUNDS;
  const PBA_RING = [
    [b.getSouth(), b.getWest()],
    [b.getSouth(), b.getEast()],
    [b.getNorth(), b.getEast()],
    [b.getNorth(), b.getWest()]
  ];
  L.polygon([WORLD_RING, PBA_RING], {
    stroke: false, fillColor: '#000', fillOpacity: 0.55, interactive: false
  }).addTo(map);

  // --- Marcadores de paradas: SOLO pin (sin popup fijo) ---
  const pinIcon = L.icon({
    iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-violet.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    shadowSize: [41, 41]
  });

  paradas.forEach((p, i) => {
    const marker = L.marker(p.coords, { icon: pinIcon }).addTo(map);
    // Click → galería si ya fue recorrida
    if (i <= config.ultimoRecorridoIndex) {
      marker.on("click", () => openGaleria(p));
    } else {
      marker.on("click", () => alert("Próximamente…"));
    }
  });

  // --- Índice inicial y BUS en la parada correcta ---
  currentIndex = Math.min(
    Number.isInteger(config.ultimoRecorridoIndex) ? config.ultimoRecorridoIndex : 0,
    paradas.length - 1
  );

  const busIcon = L.icon({
    iconUrl: "media/bus.png",   // tu PNG violeta con logo
    iconSize: [90, 90],
    iconAnchor: [45, 45]
  });

  busMarker = L.marker(paradas[currentIndex].coords, { icon: busIcon }).addTo(map);
  map.panTo(paradas[currentIndex].coords);

  // Click en el bus → transmisión en vivo
  if (config.liveUrl && config.liveUrl.trim() !== "") {
    busMarker.on("click", () => window.open(config.liveUrl, "_blank"));
  }

  // Construir UI (tira y selector) DESPUÉS de fijar currentIndex
  buildBadges();
  bindSelector();
  updateSelectorUI(); // pinta nombre y resalta badge actuales
}

// ====================
// UI: Badges (tira inferior) y Selector (flechas)
// ====================
// Reemplazá COMPLETO buildBadges() por esta versión
function buildBadges() {
  const cont = document.getElementById("badges");
  cont.innerHTML = "";

  paradas.forEach((p, i) => {
    const span = document.createElement("span");
    span.className = "badge" + (i === currentIndex ? " active" : "");
    span.textContent = p.nombre;

    // Al tocar un distrito en la tira inferior:
    // - si ya fue recorrido (<= ultimoRecorridoIndex) -> abre galería
    // - si NO fue recorrido -> aviso "Próximamente…"
    span.onclick = () => {
      if (i <= (config.ultimoRecorridoIndex ?? 0)) {
        if (Array.isArray(p.fotos) && p.fotos.length > 0) {
          openGaleria(p);
        } else {
          alert("Aún sin fotos para esta localidad.");
        }
      } else {
        alert("Próximamente…");
      }
    };

    cont.appendChild(span);
  });
}

function bindSelector() {
  document.getElementById("prevStop").onclick = () => {
    const next = (currentIndex - 1 + paradas.length) % paradas.length;
    goToIndex(next); // mueve el bus
  };
  document.getElementById("nextStop").onclick = () => {
    const next = (currentIndex + 1) % paradas.length;
    goToIndex(next); // mueve el bus
  };
}

function updateSelectorUI() {
  const nameEl = document.getElementById("selectorName");
  nameEl.textContent = paradas[currentIndex].nombre;

  const badges = document.querySelectorAll("#badges .badge");
  badges.forEach((b, i) => b.classList.toggle("active", i === currentIndex));
}


// ====================
// Navegación: ir a índice (anima, popup 2s, confeti opcional)
// ====================
async function goToIndex(i) {
  if (i === currentIndex || isMoving) return;
  isMoving = true;

  const destino = paradas[i].coords;
  await moverSuave(destino);   // animación del bus

  currentIndex = i;
  updateSelectorUI();

  // Popup temporal de 2 segundos SOLO al llegar el bus
  const popup = L.popup({ closeButton: false, autoClose: true })
    .setLatLng(paradas[i].coords)
    .setContent(`
      <div style="text-align:center;">
        <div style="font-weight:800; font-size:16px; color:#4c2882; margin-bottom:4px;">
          ${paradas[i].nombre}
        </div>
      </div>
    `)
    .addTo(map);

  setTimeout(() => {
    if (map && popup) map.removeLayer(popup);
  }, 2000);

  if (config.confeti) lanzarConfeti();
  await esperar(config.pausaParadaMs);

  isMoving = false;
}

// ====================
// Movimiento del colectivo (suave)
// ====================
async function moverSuave(destino) {
  const origen = busMarker.getLatLng();
  const pasos = 120;  // ajustá si querés más/menos suavidad
  const delay = 25;   // ms entre pasos → subilo para más lento

  const latStep = (destino[0] - origen.lat) / pasos;
  const lngStep = (destino[1] - origen.lng) / pasos;

  for (let j = 0; j < pasos; j++) {
    const lat = origen.lat + latStep * j;
    const lng = origen.lng + lngStep * j;
    busMarker.setLatLng([lat, lng]);
    await esperar(delay);
  }

  busMarker.setLatLng(destino);
  map.panTo(destino);
}

// ====================
// Utilidades
// ====================
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function lanzarConfeti() {
  const duration = 2000; // 2 segundos
  const end = Date.now() + duration;
  (function frame() {
    confetti({
      particleCount: 50,
      startVelocity: 40,
      spread: 80,
      origin: { x: 0.5, y: 0.6 },
      colors: ['#4c2882']
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// ====================
// Galería
// ====================
let galeriaIndex = 0;

function openGaleria(parada) {
  galeriaIndex = 0;

  // Título + subtítulo rojo en el modal
  document.getElementById("modalTitulo").innerHTML = `
    <div class="modal-titulo">
      <div class="localidad" style="font-weight:800; font-size:18px; color:#4c2882; margin-bottom:4px;">${parada.nombre}</div>
      <div class="sub" style="font-weight:700; color:#c51919;">KIRCHNERISMO NUNCA MÁS</div>
    </div>
  `;

  mostrarImagen(parada, galeriaIndex);
  document.getElementById("modal").classList.remove("hidden");

  document.getElementById("prevImg").onclick = () => {
    galeriaIndex = (galeriaIndex - 1 + parada.fotos.length) % parada.fotos.length;
    mostrarImagen(parada, galeriaIndex);
  };
  document.getElementById("nextImg").onclick = () => {
    galeriaIndex = (galeriaIndex + 1) % parada.fotos.length;
    mostrarImagen(parada, galeriaIndex);
  };
}

function mostrarImagen(parada, index) {
  const img = document.getElementById("galeriaImg");
  const pie = document.getElementById("pieFoto");
  const src = parada.fotos[index];
  img.onerror = () => { pie.textContent = "No se pudo cargar la imagen."; };
  img.onload  = () => { pie.textContent = `Foto ${index + 1} de ${parada.fotos.length}`; };
  img.src = src;
}

document.getElementById("closeModal").onclick = () => {
  document.getElementById("modal").classList.add("hidden");
};

// ====================
// Iniciar
// ====================
init();
