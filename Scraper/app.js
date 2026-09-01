/* =========================================
ORBE CONTENT RESEARCH
========================================= */

// Cambia esto si tu backend corre en otro puerto/host,
// o cuando lo subas a producción.
const API_BASE_URL = "http://127.0.0.1:8000";

let videos = [];
let selectedVideos = [];
let savedVideos = [];

/* =========================================
DOM
========================================= */

const urlInput = document.getElementById("urlInput");
const amountSelect = document.getElementById("amountSelect");
const searchBtn = document.getElementById("searchBtn");
const resultsGrid = document.getElementById("resultsGrid");
const resultsTitle = document.getElementById("resultsTitle");
const selectedCount = document.getElementById("selectedCount");
const selectAllBtn = document.getElementById("selectAllBtn");
const resultsActions = document.getElementById("resultsActions");
const continuePanel = document.getElementById("continuePanel");
const continueBtn = document.getElementById("continueBtn");

const libraryGrid = document.getElementById("libraryGrid");
const analysisTable = document.getElementById("analysisTable");

const avgViews = document.getElementById("avgViews");
const avgLikes = document.getElementById("avgLikes");
const avgComments = document.getElementById("avgComments");
const avgEngagement = document.getElementById("avgEngagement");

const insights = document.getElementById("insights");
const topVideoInsight = document.getElementById("topVideoInsight");
const engagementInsight = document.getElementById("engagementInsight");

const toast = document.getElementById("toast");
const toastMessage = document.getElementById("toastMessage");

/* =========================================
SEARCH
========================================= */

async function searchVideos() {

    if (!urlInput || !searchBtn) {
        console.error("No se encontró urlInput o searchBtn en el HTML.");
        return;
    }

    const url = urlInput.value.trim();

    if (!url) {
        showToast("Pega una URL primero.");
        return;
    }

    if (
        !url.includes("tiktok.com") &&
        !url.includes("instagram.com")
    ) {
        showToast("Usa una URL de TikTok o Instagram.");
        return;
    }

    const maxResults = amountSelect
        ? parseInt(amountSelect.value, 10) || 10
        : 10;

    const originalText = searchBtn.innerHTML;

    searchBtn.innerHTML = "Conectando...";
    searchBtn.disabled = true;

    if (resultsTitle) {
        resultsTitle.textContent = "Buscando, esto puede tardar unos segundos...";
    }

    try {

        const endpoint =
            `${API_BASE_URL}/search` +
            `?url=${encodeURIComponent(url)}` +
            `&max_results=${maxResults}`;

        const response = await fetch(endpoint);

        const data = await response.json();

        if (!response.ok) {
            // FastAPI devuelve el mensaje de error en "detail"
            throw new Error(data.detail || "El servidor respondió con error.");
        }

        console.log("Respuesta del backend:", data);

        if (!data.success) {
            throw new Error("El backend devolvió un error.");
        }

        videos = data.videos || [];
        selectedVideos = [];

        if (videos.length === 0) {
            showToast("No se encontraron videos para esa búsqueda.");
            if (resultsTitle) {
                resultsTitle.textContent = "Sin resultados";
            }
            resultsGrid.innerHTML = "";
        } else {
            showToast(`${videos.length} videos encontrados.`);
            if (resultsTitle) {
                resultsTitle.textContent = `${videos.length} videos encontrados`;
            }
        }

        if (resultsActions) {
            resultsActions.classList.toggle("hidden", videos.length === 0);
        }

        renderResults();
        updateSelectedCount();

    } catch (error) {

        console.error(error);

        showToast(error.message || "No se pudo conectar con el backend.");

        if (resultsTitle) {
            resultsTitle.textContent = "Esperando una búsqueda";
        }

    } finally {

        searchBtn.innerHTML = originalText;
        searchBtn.disabled = false;

    }
}

/* =========================================
ESCAPE HTML
(evita romper el layout o inyectar HTML
si el título/cuenta trae caracteres especiales,
algo que pasará con datos reales del backend)
========================================= */

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* =========================================
RENDER RESULTS
========================================= */

function renderResults() {

    if (!resultsGrid) {
        console.error("No se encontró resultsGrid.");
        return;
    }

    if (videos.length === 0) {
        resultsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⌕</div>
                <h3>Comienza una investigación.</h3>
                <p>Pega una URL para buscar referencias.</p>
            </div>
        `;
        updateContinuePanel();
        return;
    }

    resultsGrid.innerHTML = "";

    videos.forEach(function (video, index) {

        const card = createVideoCard(video, index, true);

        resultsGrid.appendChild(card);

    });

    updateContinuePanel();
}

/* =========================================
CREATE VIDEO CARD

`selectable` controla si la tarjeta responde a
clics para seleccionar/deseleccionar. Los
resultados de búsqueda son seleccionables;
las tarjetas de la biblioteca NO deben serlo,
porque no comparten el mismo array de selección.
========================================= */

function createVideoCard(video, index, selectable) {

    const card = document.createElement("article");

    const isSelected = selectable && selectedVideos.some(function (item) {
        return item.id === video.id;
    });

    card.className = isSelected
        ? "video-card selected"
        : "video-card";

    if (!selectable) {
        card.classList.add("video-card-static");
    }

    card.innerHTML = `
        <div class="video-thumbnail">

            <div class="video-number">
                #${index + 1}
            </div>

            ${selectable ? `
            <div class="checkbox">
                ${isSelected ? "✓" : ""}
            </div>
            ` : ""}

            <div class="play-icon">
                ▶
            </div>

        </div>

        <div class="video-info">

            <h4>${escapeHtml(video.title)}</h4>

            <p class="video-account">
                ${escapeHtml(video.account)}
            </p>

            <div class="video-metrics">

                <div class="mini-metric">
                    <span>VISTAS</span>
                    <strong>${formatNumber(video.views)}</strong>
                </div>

                <div class="mini-metric">
                    <span>LIKES</span>
                    <strong>${formatNumber(video.likes)}</strong>
                </div>

                <div class="mini-metric">
                    <span>COMENTARIOS</span>
                    <strong>${formatNumber(video.comments)}</strong>
                </div>

                <div class="mini-metric">
                    <span>COMPARTIDOS</span>
                    <strong>${formatNumber(video.shares)}</strong>
                </div>

            </div>

        </div>
    `;

    if (selectable) {
        card.addEventListener("click", function () {
            toggleVideoSelection(video);
        });
    }

    return card;
}

/* =========================================
SELECT VIDEO
========================================= */

function toggleVideoSelection(video) {

    const exists = selectedVideos.some(function (item) {
        return item.id === video.id;
    });

    if (exists) {

        selectedVideos = selectedVideos.filter(function (item) {
            return item.id !== video.id;
        });

        showToast("Video eliminado.");

    } else {

        if (selectedVideos.length >= videos.length) {
            showToast("Ya seleccionaste todos los videos disponibles.");
            return;
        }

        selectedVideos.push(video);

        showToast("Video seleccionado.");

    }

    renderResults();
    updateSelectedCount();
}

/* =========================================
SELECT ALL
(ahora funciona como toggle: si ya están
todos seleccionados, los deselecciona)
========================================= */

function selectAllVideos() {

    const allSelected = videos.length > 0 && selectedVideos.length === videos.length;

    if (allSelected) {

        selectedVideos = [];
        showToast("Selección eliminada.");

    } else {

        selectedVideos = videos.slice();
        showToast("Videos seleccionados.");

    }

    renderResults();
    updateSelectedCount();
}

/* =========================================
COUNTER
========================================= */

function updateSelectedCount() {

    if (selectedCount) {
        selectedCount.textContent = selectedVideos.length;
    }
}

/* =========================================
CONTINUE PANEL
========================================= */

function updateContinuePanel() {

    if (!continuePanel) {
        return;
    }

    if (selectedVideos.length > 0) {
        continuePanel.classList.remove("hidden");
    } else {
        continuePanel.classList.add("hidden");
    }
}

/* =========================================
LIBRARY
========================================= */

function renderLibrary() {

    if (!libraryGrid) {
        return;
    }

    libraryGrid.innerHTML = "";

    if (savedVideos.length === 0) {

        libraryGrid.innerHTML = `
            <div class="empty-state">

                <div class="empty-icon">▣</div>

                <h3>Tu biblioteca está vacía.</h3>

                <p>
                    Realiza una investigación y selecciona algunos videos.
                </p>

            </div>
        `;

        return;

    }

    savedVideos.forEach(function (video, index) {

        const card = createVideoCard(video, index, false);

        libraryGrid.appendChild(card);

    });
}

/* =========================================
ENGAGEMENT
========================================= */

function calculateEngagement(video) {

    if (!video.views || video.views === 0) {
        return 0;
    }

    const interactions =
        video.likes +
        video.comments +
        video.shares +
        video.saves;

    return (interactions / video.views) * 100;
}

/* =========================================
ANALYSIS
========================================= */

function renderAnalysis() {

    if (savedVideos.length === 0) {
        return;
    }

    renderMetrics();
    renderTable();
    renderInsights();
}

/* =========================================
METRICS
========================================= */

function renderMetrics() {

    const totalViews = savedVideos.reduce(function (total, video) {
        return total + video.views;
    }, 0);

    const totalLikes = savedVideos.reduce(function (total, video) {
        return total + video.likes;
    }, 0);

    const totalComments = savedVideos.reduce(function (total, video) {
        return total + video.comments;
    }, 0);

    const averageViews =
        totalViews / savedVideos.length;

    const averageLikes =
        totalLikes / savedVideos.length;

    const averageComments =
        totalComments / savedVideos.length;

    const totalEngagement =
        savedVideos.reduce(function (total, video) {
            return total + calculateEngagement(video);
        }, 0);

    const averageEngagement =
        totalEngagement / savedVideos.length;

    if (avgViews) {
        avgViews.textContent = formatNumber(averageViews);
    }

    if (avgLikes) {
        avgLikes.textContent = formatNumber(averageLikes);
    }

    if (avgComments) {
        avgComments.textContent = formatNumber(averageComments);
    }

    if (avgEngagement) {
        avgEngagement.textContent =
            averageEngagement.toFixed(2) + "%";
    }
}

/* =========================================
TABLE
========================================= */

function renderTable() {

    if (!analysisTable) {
        return;
    }

    analysisTable.innerHTML = "";

    savedVideos.forEach(function (video) {

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHtml(video.title)}</td>
            <td>${formatNumber(video.views)}</td>
            <td>${formatNumber(video.likes)}</td>
            <td>${formatNumber(video.comments)}</td>
            <td>${formatNumber(video.shares)}</td>
            <td>${formatNumber(video.saves)}</td>
            <td>${calculateEngagement(video).toFixed(2)}%</td>
        `;

        analysisTable.appendChild(row);

    });
}

/* =========================================
INSIGHTS
========================================= */

function renderInsights() {

    if (savedVideos.length === 0) {
        return;
    }

    const topVideo =
        savedVideos.slice().sort(function (a, b) {
            return b.views - a.views;
        })[0];

    const bestEngagement =
        savedVideos.slice().sort(function (a, b) {
            return calculateEngagement(b) - calculateEngagement(a);
        })[0];

    if (topVideoInsight) {

        topVideoInsight.textContent =
            `"${topVideo.title}" tiene el mayor alcance con ` +
            formatNumber(topVideo.views) +
            " vistas.";

    }

    if (engagementInsight) {

        engagementInsight.textContent =
            `"${bestEngagement.title}" tiene el mejor engagement: ` +
            calculateEngagement(bestEngagement).toFixed(2) +
            "%.";

    }

    if (insights) {
        insights.classList.remove("hidden");
    }
}

/* =========================================
FORMAT NUMBER
========================================= */

function formatNumber(number) {

    number = Number(number) || 0;

    if (number >= 1000000) {
        return (number / 1000000).toFixed(1) + "M";
    }

    if (number >= 1000) {
        return (number / 1000).toFixed(1) + "K";
    }

    return Math.round(number).toString();
}

/* =========================================
TOAST
========================================= */

function showToast(message) {

    console.log(message);

    if (!toast || !toastMessage) {
        return;
    }

    toastMessage.textContent = message;

    toast.classList.add("show");

    setTimeout(function () {
        toast.classList.remove("show");
    }, 2200);
}

/* =========================================
BUTTON EVENTS
========================================= */

if (searchBtn) {

    searchBtn.addEventListener("click", searchVideos);
}

if (urlInput) {

    urlInput.addEventListener("keydown", function (event) {

        if (event.key === "Enter") {
            event.preventDefault();
            searchVideos();
        }

    });
}

if (selectAllBtn) {

    selectAllBtn.addEventListener("click", selectAllVideos);
}

if (continueBtn) {

    continueBtn.addEventListener("click", function () {

        if (selectedVideos.length === 0) {

            showToast("Selecciona al menos un video.");

            return;

        }

        savedVideos = selectedVideos.slice();

        renderLibrary();
        renderAnalysis();

        showToast("Investigación guardada.");

    });
}

/* =========================================
NAVIGATION
========================================= */

const navItems =
    document.querySelectorAll(".nav-item");

navItems.forEach(function (item) {

    item.addEventListener("click", function () {

        const sectionName =
            item.dataset.section;

        if (sectionName) {
            switchSection(sectionName);
        }

    });
});

function switchSection(sectionName) {

    document
        .querySelectorAll(".page-section")
        .forEach(function (section) {

            section.classList.remove("active");

        });

    const target =
        document.getElementById(sectionName);

    if (target) {
        target.classList.add("active");
    }

    navItems.forEach(function (item) {

        item.classList.remove("active");

        if (item.dataset.section === sectionName) {
            item.classList.add("active");
        }

    });
}

/* =========================================
INITIAL
========================================= */

renderLibrary();
updateSelectedCount();
updateContinuePanel();
