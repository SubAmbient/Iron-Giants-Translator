// ══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════
const LANG_FILES = [
    "en_US.ini",
    "hu_HU.ini",
    "ja_JP.ini",
    "nl_NL.ini",
    "pl_PL.ini",
    "cz_CZ.ini",
    "ru_RU.ini",
    "fr_FR.ini",
    "de_DE.ini",
    "pt_BR.ini",
    "pt_PT.ini"
];

const READONLY_FILES  = ["en_US.ini"];
const ENGLISH_SOURCE  = "en_US.ini";

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
function isEffectivelyTranslated(e) {
    if (!e.translated) return false;
    const engVal = state.englishMap[e.key];
    if (engVal !== undefined && e.translated === engVal) return false;
    return true;
}

function escHtml(str) {
    return String(str)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function setStatus(msg, ok) {
    $("#statusText").text(msg);
    ok ? $("#statusDot").addClass("green") : $("#statusDot").removeClass("green");
}
function toast(html, type = "info") {
    const $t = $(`<div class="ig-toast ${type}">${html}</div>`).appendTo("#toastArea");
    setTimeout(() => $t.fadeOut(300, function(){ $(this).remove(); }), 3500);
}

// Is the viewport in mobile card mode?
function isMobileCards() { return window.innerWidth <= 600; }

// ══════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════
let state = {
    activeFile: null, sections: [], entries: [], meta: {},
    filter: "all", search: "", isReadonly: false, englishMap: {}
};

// ══════════════════════════════════════════════════════════════════
// INI PARSER
// ══════════════════════════════════════════════════════════════════
function parseIni(text) {
    const sections = [];
    let currentSection = { name: "General", entries: [] };
    sections.push(currentSection);

    text.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) { currentSection.entries.push({ spacer: true }); return; }
        if (trimmed.startsWith(";") || trimmed.startsWith("#")) return;

        const sectionMatch = trimmed.match(/^\[(.+)\]$/);
        if (sectionMatch) {
            currentSection = { name: sectionMatch[1], entries: [] };
            sections.push(currentSection);
            return;
        }

        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let val   = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        currentSection.entries.push({ key, value: val });
    });

    const flat = [], meta = {};
    sections.forEach(sec => {
        if (sec.name === "Meta") {
            sec.entries.forEach(e => { if (!e.spacer) meta[e.key] = e.value; });
            return;
        }
        sec.entries.forEach(e => {
            if (e.spacer) { flat.push({ spacer: true, section: sec.name }); }
            else { flat.push({ key: e.key, value: e.value, section: sec.name, translated: e.key !== e.value ? e.value : "" }); }
        });
    });
    return { sections, flat, meta };
}

// ══════════════════════════════════════════════════════════════════
// INI SERIALIZER
// ══════════════════════════════════════════════════════════════════
function serializeIni() {
    const m = state.meta;
    let out = `[Meta]\n`;
    if (m.id)   out += `id="${m.id}"\n`;
    if (m.name) out += `name="${m.name}"\n`;
    if (m.flag) out += `flag="${m.flag}"\n`;
    out += `\n[Translations]\n`;
    state.entries.forEach(e => {
        if (e.spacer) { out += `\n`; return; }
        out += `${e.key}="${e.translated || e.value}"\n`;
    });
    return out;
}

// ══════════════════════════════════════════════════════════════════
// SIDEBAR — mobile drawer toggle
// ══════════════════════════════════════════════════════════════════
function openSidebar() {
    $("#sidebar").addClass("open");
    $("body").css("overflow", "hidden");
}
function closeSidebar() {
    $("#sidebar").removeClass("open");
    $("body").css("overflow", "");
}

// ══════════════════════════════════════════════════════════════════
// FILE LIST
// ══════════════════════════════════════════════════════════════════
function renderFileList() {
    const $list = $("#fileList").empty();
    if (!LANG_FILES.length) {
        $list.html('<div style="color:var(--text-muted);font-size:12px;">No files configured.</div>');
        return;
    }
    LANG_FILES.forEach(fname => {
        const isRo = READONLY_FILES.includes(fname);
        const $item = $(`
                <div class="file-item" data-file="${fname}">
                    <i class="bi bi-file-code"></i>
                    <span class="file-name">${fname}</span>
                    ${isRo
            ? `<span class="ro-icon" title="Read-only"><i class="bi bi-lock-fill"></i></span>`
            : `<span class="file-count" data-file="${fname}"><i class="bi bi-arrow-repeat" style="font-size:10px;opacity:.5;"></i></span>`
        }
                </div>
            `);
        $item.on("click", () => { loadFile(fname); closeSidebar(); });
        $list.append($item);
    });

    LANG_FILES.forEach(async fname => {
        if (READONLY_FILES.includes(fname)) return;
        try {
            let engMap = {};
            try {
                const engRes = await fetch(`LangFiles/${ENGLISH_SOURCE}`);
                if (engRes.ok) {
                    const { flat: engFlat } = parseIni(await engRes.text());
                    engFlat.forEach(e => { if (!e.spacer) engMap[e.key] = e.value; });
                }
            } catch(_) {}
            const res = await fetch(`LangFiles/${fname}`);
            if (!res.ok) throw new Error();
            const { flat } = parseIni(await res.text());
            const total = flat.filter(e => !e.spacer).length;
            const done  = flat.filter(e => {
                if (e.spacer || !e.translated) return false;
                const engVal = engMap[e.key];
                return !(engVal !== undefined && e.translated === engVal);
            }).length;
            const cls = done === total && total > 0 ? "complete" : done > 0 ? "partial" : "empty";
            $(`.file-count[data-file="${fname}"]`).text(`${done}/${total}`).removeClass("complete partial empty").addClass(cls);
        } catch(_) {
            $(`.file-count[data-file="${fname}"]`).text("err").css("color","var(--accent2)");
        }
    });
}

async function loadFile(fname) {
    $(".file-item").removeClass("active");
    $(`.file-item[data-file="${fname}"]`).addClass("active");
    setStatus("Loading…", false);

    try {
        const res = await fetch(`LangFiles/${fname}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseIni(await res.text());
        state.activeFile = fname;
        state.sections   = parsed.sections;
        state.entries    = parsed.flat;
        state.meta       = parsed.meta;
        state.isReadonly = READONLY_FILES.includes(fname);

        state.englishMap = {};
        if (!state.isReadonly && fname !== ENGLISH_SOURCE) {
            try {
                const engRes = await fetch(`LangFiles/${ENGLISH_SOURCE}`);
                if (engRes.ok) {
                    const { flat: ef } = parseIni(await engRes.text());
                    ef.forEach(e => { if (!e.spacer) state.englishMap[e.key] = e.value; });
                }
            } catch(_) {}
        }

        if (state.isReadonly) {
            $("#readonlyBadge").show();
            $("#roNotice").show();
            $("#btnExport, #btnExportMobile").prop("disabled", true);
            $("#btnClear, #btnClearMobile").prop("disabled", true);
            $("#filterUntranslated, #filterTranslated").hide();
        } else {
            $("#readonlyBadge").hide();
            $("#roNotice").hide();
            $("#btnExport, #btnExportMobile").prop("disabled", false);
            $("#btnClear, #btnClearMobile").prop("disabled", false);
            $("#filterUntranslated, #filterTranslated").show();
        }

        const done = state.entries.filter(e => !e.spacer && isEffectivelyTranslated(e)).length;
        const total = state.entries.filter(e => !e.spacer).length;
        if (!state.isReadonly) {
            const cls = done === total && total > 0 ? "complete" : done > 0 ? "partial" : "empty";
            $(`.file-count[data-file="${fname}"]`).text(`${done}/${total}`).removeClass("complete partial empty").addClass(cls);
        }

        renderTable();
        updateProgress();
        setStatus(`${fname}${state.isReadonly ? " (read-only)" : ""}`, true);
        toast(`Loaded <strong>${fname}</strong> — ${total} strings${state.isReadonly ? " · <span style='color:var(--accent2)'>read-only</span>" : ""}`, state.isReadonly ? "info" : "success");
    } catch(err) {
        toast(`Failed to load <strong>${fname}</strong>: ${err.message}`, "error");
        setStatus("Load error", false);
    }
}

// ══════════════════════════════════════════════════════════════════
// FILTER
// ══════════════════════════════════════════════════════════════════
function getVisible() {
    return state.entries.filter(e => {
        if (e.spacer) return false;
        if (state.filter === "translated"   && !isEffectivelyTranslated(e)) return false;
        if (state.filter === "untranslated" &&  isEffectivelyTranslated(e)) return false;
        if (state.search) {
            const q = state.search.toLowerCase();
            if (!e.key.toLowerCase().includes(q) && !e.value.toLowerCase().includes(q)) return false;
        }
        return true;
    });
}

// ══════════════════════════════════════════════════════════════════
// TABLE RENDER — desktop vs mobile card view
// ══════════════════════════════════════════════════════════════════
function renderTable() {
    const $wrap = $("#tableWrap").empty();
    const visible = getVisible();
    $("#rowCount").text(`${visible.length} / ${state.entries.filter(e=>!e.spacer).length}`);

    if (!state.entries.length) {
        $wrap.html('<div class="empty-state"><i class="bi bi-file-earmark-code"></i><p>Select a language file to begin</p></div>');
        return;
    }
    if (!visible.length) {
        $wrap.html('<div class="empty-state"><i class="bi bi-funnel"></i><p>No strings match your filter</p></div>');
        return;
    }

    if (isMobileCards()) {
        renderMobileCards($wrap, visible);
    } else {
        renderDesktopTable($wrap, visible);
    }
}

/* ─── Desktop table ─── */
function renderDesktopTable($wrap, visible) {
    const ro = state.isReadonly;
    let lastSection = null;
    const $table = $(`<table class="trans-table desktop-table"><thead><tr>
            <th>#</th><th>Key</th>
            <th>${ro ? "Value" : "Original"}</th>
            ${ro ? "" : "<th>Translation</th>"}
        </tr></thead></table>`);
    const $body = $('<tbody>');
    let rowNum = 1;

    visible.forEach(e => {
        if (e.section !== lastSection) {
            const colspan = ro ? 3 : 4;
            $body.append(`<tr class="section-header-row"><td colspan="${colspan}">[${e.section}]</td></tr>`);
            lastSection = e.section;
        }

        const entryIdx = state.entries.indexOf(e);
        const $row = $(`<tr class="trans-row ${isEffectivelyTranslated(e) ? 'translated' : 'untranslated'}" data-idx="${entryIdx}"></tr>`);

        if (ro) {
            $row.html(`
                    <td class="col-num row-status">${rowNum++}</td>
                    <td class="col-key"><span class="key-tag" title="${e.key}">${e.key}</span></td>
                    <td class="col-original" colspan="2" style="color:var(--text-primary);">${escHtml(e.value)}</td>
                `);
        } else {
            const eff = isEffectivelyTranslated(e);
            const sameAsEng = e.translated && !eff && state.englishMap[e.key] !== undefined && e.translated === state.englishMap[e.key];
            $row.html(`
                    <td class="col-num row-status">${rowNum++}</td>
                    <td class="col-key"><span class="key-tag" title="${e.key}">${e.key}</span></td>
                    <td class="col-original">${escHtml(e.value)}</td>
                    <td class="col-translation">
                        <input class="trans-input ${eff ? 'has-value' : ''}"
                               type="text" value="${escHtml(e.translated)}"
                               placeholder="${escHtml(e.value)}"
                               data-idx="${entryIdx}" />
                    </td>
                `);
        }
        $body.append($row);
    });

    $table.append($body);
    $wrap.append($table);
    if (!ro) attachInputEvents($wrap);
}

/* ─── Mobile card view ─── */
function renderMobileCards($wrap, visible) {
    const ro = state.isReadonly;
    const $container = $('<div class="mobile-cards">');
    let lastSection = null;
    let rowNum = 1;

    visible.forEach(e => {
        if (e.section !== lastSection) {
            $container.append(`<div class="section-header-mobile">[${e.section}]</div>`);
            lastSection = e.section;
        }

        const entryIdx = state.entries.indexOf(e);
        const eff = isEffectivelyTranslated(e);
        const $card = $(`<div class="mobile-entry-card" data-idx="${entryIdx}">`);

        $card.append(`
                <div class="mobile-card-meta">
                    <span class="mobile-card-num row-status" style="color:${eff ? 'var(--success)' : 'var(--text-muted)'}">${rowNum++}</span>
                    <span class="key-tag" title="${e.key}">${e.key}</span>
                </div>
                <div class="mobile-card-original">${escHtml(e.value)}</div>
            `);

        if (!ro) {
            $card.append(`
                    <div class="mobile-card-input-wrap">
                        <input class="trans-input ${eff ? 'has-value' : ''}"
                               type="text" value="${escHtml(e.translated)}"
                               placeholder="${escHtml(e.value)}"
                               data-idx="${entryIdx}" />
                    </div>
                `);
        }

        $container.append($card);
    });

    $wrap.append($container);
    if (!ro) attachInputEvents($wrap);
}

function attachInputEvents($wrap) {
    $wrap.on("input", ".trans-input", function() {
        const idx = +$(this).data("idx");
        const val = $(this).val();
        state.entries[idx].translated = val;
        const e   = state.entries[idx];
        const eff = isEffectivelyTranslated(e);

        $(this).toggleClass("has-value", eff);

        // Update row/card status dot
        const $card = $(this).closest("[data-idx]");
        $card.find(".row-status").css("color", eff ? "var(--success)" : "var(--text-muted)");

        // Desktop table row class
        const $row = $(this).closest("tr");
        if ($row.length) {
            $row.toggleClass("translated", eff).toggleClass("untranslated", !eff);
        }

        updateProgress();
    });
}

// ══════════════════════════════════════════════════════════════════
// PROGRESS
// ══════════════════════════════════════════════════════════════════
function updateProgress() {
    const entries = state.entries.filter(e => !e.spacer);
    const total = entries.length;
    const done  = entries.filter(e => isEffectivelyTranslated(e)).length;
    const pct   = total ? Math.round((done / total) * 100) : 0;
    $("#progressLabel").text(`${done} / ${total}`);
    $("#progressBar").css("width", pct + "%");

    if (state.activeFile && !state.isReadonly) {
        const cls = done === total && total > 0 ? "complete" : done > 0 ? "partial" : "empty";
        $(`.file-count[data-file="${state.activeFile}"]`).text(`${done}/${total}`).removeClass("complete partial empty").addClass(cls);
    }
}

// ══════════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════════
function exportIni() {
    if (!state.entries.length) { toast("Nothing to export — load a file first", "error"); return; }
    if (state.isReadonly) { toast("This file is read-only and cannot be exported", "error"); return; }
    const code = state.activeFile ? state.activeFile.replace(".ini", "") : "xx_XX";
    const blob = new Blob([serializeIni()], { type: "text/plain;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const $a   = $('<a>').attr({ href: url, download: `${code}.ini` }).appendTo("body");
    $a[0].click(); $a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported <strong>${code}.ini</strong>`, "success");
}

function clearTranslations() {
    if (!state.entries.length || state.isReadonly) return;
    if (!confirm("Clear all translations in this file?")) return;
    state.entries.forEach(e => { if (!e.spacer) e.translated = ""; });
    renderTable();
    updateProgress();
    toast("Translations cleared", "info");
}

// ══════════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════════
$(function() {
    renderFileList();

    // Hamburger
    $("#btnHamburger").on("click", openSidebar);
    $("#btnCloseSidebar").on("click", closeSidebar);

    // Search
    $("#searchInput").on("input", function() {
        state.search = $(this).val().trim().toLowerCase();
        renderTable();
    });

    // Filters
    $(".filter-btn").on("click", function() {
        $(".filter-btn").removeClass("active");
        $(this).addClass("active");
        state.filter = $(this).data("filter");
        renderTable();
    });

    // Actions — desktop sidebar + mobile bar
    $("#btnExport, #btnExportMobile").on("click", exportIni);
    $("#btnClear, #btnClearMobile").on("click", clearTranslations);

    // Re-render table on resize (card/table mode switch)
    // Only re-render when the layout MODE changes (≤600px vs >600px),
    // NOT on every resize — prevents the Android soft keyboard from
    // triggering a full re-render that destroys the focused input.
    let resizeTimer;
    let lastMobileCards = isMobileCards();
    $(window).on("resize", function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const nowMobile = isMobileCards();
            if (nowMobile !== lastMobileCards) {
                lastMobileCards = nowMobile;
                if (state.entries.length) renderTable();
            }
        }, 150);
    });
});