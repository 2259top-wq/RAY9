const API_BASE = '/api';

console.log("=== Options Backtester v10 ===");
// alert("如果你看到這個彈跳視窗，代表你已經成功更新到最新版 v10！");

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
    chartContainerNight: document.getElementById('priceChartNight'),
    chartTypeSelect: document.getElementById('chart-type-select'),
    displayModeSelect: document.getElementById('display-mode-select')
};

// State
let priceChartDay = null;
let priceChartNight = null;
let currentDataCache = null;

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

        els.chartTypeSelect.addEventListener('change', () => {
            if (currentDataCache) {
                renderCharts(currentDataCache);
            }
        });
        
        els.displayModeSelect.addEventListener('change', () => {
            els.typeSelect.disabled = (els.displayModeSelect.value === 'overlay');
            handleQuery();
        });
        
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

    const displayMode = els.displayModeSelect.value;

    try {
        if (displayMode === 'overlay') {
            // Fetch both C and P
            const paramsC = new URLSearchParams(params);
            paramsC.set('type', 'C');
            const paramsP = new URLSearchParams(params);
            paramsP.set('type', 'P');
            
            const [resC, resP] = await Promise.all([
                fetch(`${API_BASE}/query?${paramsC}`),
                fetch(`${API_BASE}/query?${paramsP}`)
            ]);
            
            const dataC = await resC.json();
            const dataP = await resP.json();
            
            currentDataCache = { mode: 'overlay', C: dataC, P: dataP };
            renderCharts(currentDataCache);
            updateStats(dataC); // Using C for stats in overlay mode
        } else {
            const res = await fetch(`${API_BASE}/query?${params}`);
            const data = await res.json();
            
            currentDataCache = { mode: 'single', data: data };
            renderCharts(currentDataCache);
            updateStats(data);
        }
        
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

function formatWatermarkDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return '';
    const yyyy = parseInt(dateStr.substring(0, 4), 10);
    const mm = parseInt(dateStr.substring(4, 6), 10) - 1;
    const dd = parseInt(dateStr.substring(6, 8), 10);
    const d = new Date(yyyy, mm, dd);
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[d.getDay()];
    return `${yyyy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')} (${weekday})`;
}

function partitionData(dataArr) {
    const dayData = [];
    const nightData = [];
    (dataArr || []).forEach(d => {
        if (d.hhmm >= 845 && d.hhmm < 1400) {
            dayData.push(d);
        } else {
            nightData.push(d);
        }
    });
    return { dayData, nightData };
}

function renderCharts(cacheObj) {
    if (priceChartDay) priceChartDay.remove();
    if (priceChartNight) priceChartNight.remove();

    let chartDataObjDay = {};
    let chartDataObjNight = {};

    if (cacheObj.mode === 'single') {
        const { dayData, nightData } = partitionData(cacheObj.data);
        chartDataObjDay = { mode: 'single', data: padSessionData(dayData, 'day') };
        chartDataObjNight = { mode: 'single', data: padSessionData(nightData, 'night') };
    } else if (cacheObj.mode === 'overlay') {
        const cPartition = partitionData(cacheObj.C);
        const pPartition = partitionData(cacheObj.P);
        chartDataObjDay = { 
            mode: 'overlay', 
            C: padSessionData(cPartition.dayData, 'day'), 
            P: padSessionData(pPartition.dayData, 'day') 
        };
        chartDataObjNight = { 
            mode: 'overlay', 
            C: padSessionData(cPartition.nightData, 'night'), 
            P: padSessionData(pPartition.nightData, 'night') 
        };
    }

    const watermarkText = formatWatermarkDate(els.dateSelect.value);

    priceChartDay = createChart(els.chartContainerDay, chartDataObjDay, els.noDataMsgDay, 'day', watermarkText);
    priceChartNight = createChart(els.chartContainerNight, chartDataObjNight, els.noDataMsgNight, 'night', watermarkText);
}

function padSessionData(data, sessionType) {
    if (!data || data.length === 0) return [];
    
    const firstPoint = data[0];
    const firstHhmm = firstPoint.hhmm;
    const hours = Math.floor(firstHhmm / 100);
    const mins = firstHhmm % 100;
    
    const midnightTimestamp = firstPoint.time - (hours * 3600 + mins * 60);
    let startTimestamp;
    
    if (sessionType === 'day') {
        startTimestamp = midnightTimestamp + 8 * 3600 + 45 * 60;
        // Fix: Make sure startTimestamp is strictly before firstPoint.time
        if (startTimestamp > firstPoint.time) {
            startTimestamp = firstPoint.time - (firstPoint.time % 86400) - (8 * 3600) + 8 * 3600 + 45 * 60; 
            // In Taiwan timezone (UTC+8), local midnight is UTC 16:00 previous day
            // It's safer to just step back from firstPoint.time if our calculation overshoot
            while (startTimestamp > firstPoint.time) startTimestamp -= 86400;
        }
    } else {
        if (firstHhmm < 1500) {
            // First trade is past midnight, start was previous day 15:00
            startTimestamp = midnightTimestamp - 24 * 3600 + 15 * 3600;
        } else {
            // First trade is same day, start is today 15:00
            startTimestamp = midnightTimestamp + 15 * 3600;
        }
    }
    
    const padding = [];
    for (let t = startTimestamp; t < firstPoint.time; t += 60) {
        padding.push({ 
            time: t,
            open: firstPoint.open,
            high: firstPoint.open,
            low: firstPoint.open,
            close: firstPoint.open,
            volume: 0,
            hhmm: -1 // Dummy hhmm so it doesn't get picked up as actual open
        });
    }
    
    return padding.concat(data);
}

function createChart(container, chartDataObj, msgEl, sessionType, watermarkText) {
    const isOverlay = chartDataObj.mode === 'overlay';
    
    const hasDataC = isOverlay && chartDataObj.C && chartDataObj.C.length > 0;
    const hasDataP = isOverlay && chartDataObj.P && chartDataObj.P.length > 0;
    const hasSingleData = !isOverlay && chartDataObj.data && chartDataObj.data.length > 0;

    if (!hasSingleData && !hasDataC && !hasDataP) {
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
        localization: {
            timeFormatter: (time) => {
                const d = new Date(time * 1000);
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                return `${hh}:${mm}`;
            }
        },
        watermark: {
            color: 'rgba(0, 0, 0, 0.12)', // Darker watermark color as requested
            visible: !!watermarkText,
            text: watermarkText || '',
            fontSize: 48,
            horzAlign: 'center',
            vertAlign: 'center',
        },
        grid: {
            vertLines: { color: 'rgba(0, 0, 0, 0.3)', style: 1 }, // 1 is Dotted
            horzLines: { color: 'rgba(0, 0, 0, 0.2)', style: 1 }
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
        if (legend && legend.parentNode) legend.parentNode.removeChild(legend);
        originalRemove.call(this);
    };

    chart.priceScale('right').applyOptions({
        scaleMargins: {
            top: 0.1,
            bottom: 0.2, // Leave bottom 20% for volume
        },
    });

    const chartType = isOverlay ? 'line' : els.chartTypeSelect.value;
    const activeSeries = [];

    function addSeriesAndVolume(dataArr, colorLine, title, isOverlaySecondary) {
        if (!dataArr || dataArr.length === 0) return;
        
        let priceSeries;
        if (chartType === 'line') {
            priceSeries = chart.addLineSeries({
                color: colorLine,
                lineWidth: 2,
                title: title,
                crosshairMarkerVisible: true,
                crosshairMarkerRadius: 4,
                crosshairMarkerBorderColor: '#ffffff',
                crosshairMarkerBackgroundColor: colorLine,
            });
            const lineData = dataArr.map(d => ({
                time: d.time,
                value: d.close !== undefined ? d.close : d.value
            }));
            priceSeries.setData(lineData);
        } else {
            priceSeries = chart.addCandlestickSeries({
                upColor: '#e53e3e',
                downColor: '#059669',
                borderVisible: false,
                wickUpColor: '#e53e3e',
                wickDownColor: '#059669'
            });
            priceSeries.setData(dataArr);
        }

        // Add Volume
        const volumeSeries = chart.addHistogramSeries({
            color: colorLine,
            priceFormat: { type: 'volume' },
            priceScaleId: '', // Overlay on the same scale but pin to bottom
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.85,
                bottom: 0,
            },
        });

        const volumeData = dataArr.map(d => {
            if (d.volume === undefined) return { time: d.time };
            let volColor;
            if (isOverlay) {
                volColor = colorLine === '#e53e3e' ? 'rgba(229, 62, 62, 0.3)' : 'rgba(5, 150, 105, 0.3)';
            } else {
                volColor = d.close >= d.open ? 'rgba(229, 62, 62, 0.4)' : 'rgba(5, 150, 105, 0.4)';
            }
            return { time: d.time, value: d.volume, color: volColor };
        });
        volumeSeries.setData(volumeData);

        activeSeries.push({ priceSeries, volumeSeries, title, colorLine, data: dataArr });
    }

    if (isOverlay) {
        // Red for Call, Green for Put
        addSeriesAndVolume(chartDataObj.C, '#e53e3e', 'Call', false);
        addSeriesAndVolume(chartDataObj.P, '#059669', 'Put', true);
    } else {
        // Default Blue for line chart
        addSeriesAndVolume(chartDataObj.data, '#2563eb', '', false);
    }

    // Add floating legend
    const legend = document.createElement('div');
    legend.style.position = 'absolute';
    legend.style.left = '16px';
    legend.style.top = '12px';
    legend.style.zIndex = '10';
    legend.style.fontSize = '14px';
    legend.style.lineHeight = '1.5';
    legend.style.pointerEvents = 'none';
    container.appendChild(legend);

    chart.subscribeCrosshairMove(param => {
        if (param.point === undefined || !param.time || param.point.x < 0 || param.point.y < 0) {
            legend.innerHTML = '';
            return;
        }

        const date = new Date(param.time * 1000);
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        
        let html = `<div style="font-weight: 600; font-size: 16px; margin-bottom: 4px; color: #1e293b;">${hh}:${mm}</div>`;
        let sumPrice = 0;
        let validCount = 0;
        
        activeSeries.forEach(s => {
            let priceData = param.seriesData.get(s.priceSeries);
            let volData = param.seriesData.get(s.volumeSeries);

            if (!priceData && s.data) {
                // Find last known data point
                for (let i = s.data.length - 1; i >= 0; i--) {
                    if (s.data[i].time <= param.time) {
                        priceData = s.data[i];
                        volData = { value: 0 };
                        break;
                    }
                }
            }

            const price = priceData !== undefined ? (priceData.value !== undefined ? priceData.value.toFixed(2) : (priceData.close !== undefined ? priceData.close.toFixed(2) : 'N/A')) : 'N/A';
            const vol = volData !== undefined ? volData.value : '0';
            
            if (price !== 'N/A') {
                sumPrice += parseFloat(price);
                validCount++;
                const titleStr = s.title ? `${s.title}: ` : '';
                html += `<div style="color: ${s.colorLine}; font-weight: 500; display: flex; align-items: baseline; gap: 8px;">
                    <span>${titleStr}$${price}</span>
                    <span style="font-size: 12px; color: #64748b; font-weight: normal;">Vol: ${vol}</span>
                </div>`;
            }
        });
        
        if (validCount === 2 && activeSeries.length > 1) {
            html += `<div style="color: #8b5cf6; font-weight: 600; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(0,0,0,0.1);">
                <span>總和 (C+P): $${sumPrice.toFixed(2)}</span>
            </div>`;
        }
        
        legend.innerHTML = html;
    });

    // Force the chart to show all data including our padded candles
    chart.timeScale().fitContent();

    return chart;
}

// Start
init();
