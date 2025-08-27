// ====================
// Variables globales
// ====================
let map;
let busMarker;
let paradas = [];
let config = {};
let currentIndex = 0;

// ====================
// Inicialización
// ====================
async function init() {
  // Cargar config y paradas
  const confRes = await fetch("data/config.json");
  config = await confRes.json();

  const parRes = await fetch("data/paradas.json");
  paradas = await parRes.json();

  // Crear mapa
  map = L.map("map").setView(paradas[0].coords, 11);

  // Capa base OSM
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);

  // Ruta
  const ruta = paradas.map(p => p.coords);
  L.polyline(ruta, { color: "#4c2882", weight: 5 }).addTo(map);

  // Marcadores de paradas
  paradas.forEach((p, i) => {
    const marker = L.circleMarker(p.coords, {
      radius: 8,
      color: "#4c2882",
      fillColor: "#4c2882",
      fillOpacity: i <= config.ultimoRecorridoIndex ? 1 : 0.3
    }).addTo(map);

    marker.on("click", () => {
      if (i <= config.ultimoRecorridoIndex) {
        openGaleria(p);
      } else {
        alert("Próximamente…");
      }
    });
  });

  // Icono de colectivo
  const busIcon = L.icon({
    iconUrl: "https://cdn-icons-png.flaticon.com/512/1048/1048333.png",
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  busMarker = L.marker(paradas[0].coords, { icon: busIcon }).addTo(map);

  // Botón comenzar
  document.getElementById("btnStart").onclick = () => {
    document.getElementById("btnStart").style.display = "none"; // ocultar botón
    moverBus();
  };
}

// ====================
// Movimiento del colectivo (suave)
// ====================
async function moverBus() {
  for (let i = 0; i < paradas.length; i++) {
    currentIndex = i;
    await moverSuave(paradas[i].coords);

    // Popup con nombre
    L.popup({ closeButton: false, autoClose: false })
  .setLatLng(paradas[i].coords)
  .setContent(`<div style="font-weight:bold;color:#4c2882;font-size:16px;text-align:center;">${paradas[i].nombre}</div>`)
  .openOn(map);

lanzarConfeti();


    // Pausa
    await esperar(config.pausaParadaMs);

    if (i === config.ultimoRecorridoIndex) {
      break; // detener en la última recorrida
    }
  }
}

// Función de movimiento suave
async function moverSuave(destino) {
  const origen = busMarker.getLatLng();
  const pasos = 300; // más pasos = más suave
  const delay = 60;  // ms entre pasos = más lento

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
      origin: { x: 0.5, y: 0.6 }, // centrado arriba del mapa
      colors: ['#4c2882'] // confeti violeta
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}


// ====================
// Galería
// ====================
let galeriaIndex = 0;

function openGaleria(parada) {
  galeriaIndex = 0;
  document.getElementById("modalTitulo").textContent = parada.nombre;
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
  img.src = parada.fotos[index];
  pie.textContent = `Foto ${index + 1} de ${parada.fotos.length}`;
}

document.getElementById("closeModal").onclick = () => {
  document.getElementById("modal").classList.add("hidden");
};

// ====================
// Iniciar
// ====================
init();
