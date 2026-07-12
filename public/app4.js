const API_BASE = '/api';

// UI Elements
const els = {
    dateSelect: document.getElementById('date-select'),
    contractSelect: document.getElementById('contract-select'),
    expirySelect: document.getElementById('expiry-select'),
    typeSelect: document.getElementById('type-select'),
    strikeSelect: document.getElementById('strike-select'),
    queryBtn: document.getElementById('query-btn'),
    btnText: document.querySelector('.btn-text'),
    spinner: document.querySelector('.spinner'),
    noDataMsgDay: document.getElementById('no-data-msg-day'),
    noDataMsgNight: document.getElementById('no-data-msg-night'),
    statVolume: document.getElementById('stat-volume'),
    statHigh: document.getElementById('stat-high'),
    statLow: document.getElementById('stat-low'),
    chartContainerDay: document.getElementById('priceChartDay'),
    chartContainerNight: document.getElementById('priceChartNight')
};

let priceChartDay = null;
let priceChartNight = null;

// Initialize App
async function init() {
    try {
        const res = await fetch(`${API_BASE}/options`);
        const options = await res.json();
        
        populateSelect(els.dateSelect, options.dates);
        populateSelect(els.contractSelect, options.contracts);
        populateSelect(els.expirySelect, options.expiries);
        populateSelect(els.typeSelect, options.types);
        populateSelect(els.strikeSelect, options.strikes);

        if (options.defaultParams) {
            els.dateSelect.value = options.defaultParams.date;
            els.contractSelect.value = options.defaultParams.contract;
            els.expirySelect.value = options.defaultParams.expiry;
            els.typeSelect.value = options.defaultParams.type;
            els.strikeSelect.value = options.defaultParams.strike;
        }

        // Enable UI
        Object.values(els).forEach(el => {
            if (el && el.tagName === 'SELECT') el.disabled = false;
        });
        els.queryBtn.disabled = false;

        // Add event listeners for cascading dropdowns
        els.dateSelect.addEventListener('change', updateValidParams);
        els.contractSelect.addEventListener('change', updateValidParams);
        els.expirySelect.addEventListener('change', updateValidParams);
        els.typeSelect.addEventListener('change', updateValidParams);

        els.queryBtn.addEventListener('click', handleQuery);
        
        // Auto-load data for the default parameters
        handleQuery();

    } catch (err) {
        console.error('Failed to load options:', err);
        els.noDataMsgDay.textContent = '無法連接到伺服器，請確認 server.js 已啟動。';
        els.noDataMsgNight.textContent = '無法連接到伺服器，請確認 server.js 已啟動。';
    }
}

async function updateValidParams() {
    const params = new URLSearchParams({
        date: els.dateSelect.value,
        contract: els.contractSelect.value,
        expiry: els.expirySelect.value,
        type: els.typeSelect.value
    });
    
    try {
        const res = await fetch(`${API_BASE}/valid_params?${params}`);
        const data = await res.json();
        
        // Save current selections
        const currentExpiry = els.expirySelect.value;
        const currentType = els.typeSelect.value;
        const currentStrike = els.strikeSelect.value;
        
        // Update options
        populateSelect(els.expirySelect, data.expiries);
        populateSelect(els.typeSelect, data.types);
        populateSelect(els.strikeSelect, data.strikes);
        
        // Restore selections if still valid
        if (data.expiries.includes(currentExpiry)) els.expirySelect.value = currentExpiry;
        if (data.types.includes(currentType)) els.typeSelect.value = currentType;
        if (data.strikes.includes(Number(currentStrike))) els.strikeSelect.value = currentStrike;
        
    } catch (err) {
        console.error('Failed to update valid params:', err);
    }
}

function populateSelect(selectEl, dataArray) {
    selectEl.innerHTML = '';
    dataArray.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        selectEl.appendChild(opt);
    });
}

async function handleQuery() {
    // UI Loading state
    els.btnText.classList.add('hidden');
    els.spinner.classList.remove('hidden');
    els.queryBtn.disabled = true;

    const params = new URLSearchParams({
        date: els.dateSelect.value,
        contract: els.contractSelect.value,
        expiry: els.expirySelect.value,
        type: els.typeSelect.value,
        strike: els.strikeSelect.value
    });

    try {
        const res = await fetch(`${API_BASE}/query?${params}`);
        const data = await res.json();
        
        renderCharts(data);
        updateStats(data);
        
    } catch (err) {
        console.error('Query failed:', err);
        els.noDataMsgDay.textContent = '資料取得失敗。';
        els.noDataMsgDay.classList.remove('hidden');
        els.noDataMsgNight.textContent = '資料取得失敗。';
        els.noDataMsgNight.classList.remove('hidden');
    } finally {
        // Reset UI
        els.btnText.classList.remove('hidden');
        els.spinner.classList.add('hidden');
        els.queryBtn.disabled = false;
    }
}

function updateStats(data) {
    if (!data || data.length === 0) {
        els.statVolume.textContent = '-';
        els.statHigh.textContent = '-';
        els.statLow.textContent = '-';
        return;
    }

    let totalVol = 0;
    let high = -Infinity;
    let low = Infinity;

    data.forEach(d => {
        totalVol += d.volume;
        if (d.high > high) high = d.high;
        if (d.low < low) low = d.low;
    });

    els.statVolume.textContent = totalVol.toLocaleString();
    els.statHigh.textContent = high.toFixed(2);
    els.statLow.textContent = low.toFixed(2);
}

function renderCharts(data) {
    if (priceChartDay) priceChartDay.remove();
    if (priceChartNight) priceChartNight.remove();

    const dayData = [];
    const nightData = [];

    (data || []).forEach(d => {
        // Robust timezone-independent partitioning
        if (d.hhmm >= 800 && d.hhmm < 1400) {
            dayData.push(d);
        } else {
            nightData.push(d);
        }
    });

    priceChartDay = createChart(els.chartContainerDay, dayData, els.noDataMsgDay);
    priceChartNight = createChart(els.chartContainerNight, nightData, els.noDataMsgNight);
}

function createChart(container, data, msgEl) {
    if (!data || data.length === 0) {
        msgEl.textContent = '此時段無交易資料。';
        msgEl.classList.remove('hidden');
        return null;
    } else {
        msgEl.classList.add('hidden');
    }

    const chartWidth = container.clientWidth > 0 ? container.clientWidth : 800;
    const chartHeight = container.clientHeight > 0 ? container.clientHeight : 350;

    const chart = LightweightCharts.createChart(container, {
        width: chartWidth,
        height: chartHeight,
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#86868b',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        },
        grid: {
            vertLines: { color: 'rgba(0, 0, 0, 0.15)', style: 1 }, // 1 is Dotted
            horzLines: { color: 'rgba(0, 0, 0, 0.12)', style: 1 }
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: 'rgba(0, 0, 0, 0.05)',
            tickMarkFormatter: (time) => {
                const d = new Date(time * 1000);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
            }
        },
        rightPriceScale: {
            borderColor: 'rgba(0, 0, 0, 0.05)',
        },
        crosshair: {
            mode: 1,
            vertLine: { width: 1, color: 'rgba(0, 0, 0, 0.2)', style: 0, labelBackgroundColor: '#1d1d1f' },
            horzLine: { width: 1, color: 'rgba(0, 0, 0, 0.2)', style: 0, labelBackgroundColor: '#1d1d1f' }
        }
    });

    // Handle resize with requestAnimationFrame to prevent ResizeObserver loop limit exceeded error
    const ro = new ResizeObserver(entries => {
        if (entries.length === 0 || entries[0].target !== container) return;
        const newRect = entries[0].contentRect;
        if (newRect.width > 0 && newRect.height > 0) {
            window.requestAnimationFrame(() => {
                chart.applyOptions({ width: newRect.width, height: newRect.height });
            });
        }
    });
    ro.observe(container);
    
    // Attach resize observer to chart instance so it can be cleaned up
    chart._ro = ro;
    const originalRemove = chart.remove;
    chart.remove = function() {
        if (this._ro) this._ro.disconnect();
        originalRemove.call(this);
    };

    chart.priceScale('right').applyOptions({
        scaleMargins: {
            top: 0.1,
            bottom: 0.2, // Leave bottom 20% for volume
        },
    });

    // Taiwanese candlestick colors (Red = Up, Green = Down)
    // Premium soft colors
    const candleSeries = chart.addCandlestickSeries({
        upColor: '#e53e3e',
        downColor: '#059669',
        borderVisible: false,
        wickUpColor: '#e53e3e',
        wickDownColor: '#059669'
    });
    
    candleSeries.setData(data);

    const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // Overlay on the same scale but pin to bottom
    });

    volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.85, // volume takes up bottom 15%
            bottom: 0,
        },
    });

    const volumeData = data.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(229, 62, 62, 0.4)' : 'rgba(5, 150, 105, 0.4)'
    }));

    volumeSeries.setData(volumeData);

    return chart;
}

// Start
init();
