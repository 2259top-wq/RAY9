const els = {
    dateSelect: document.getElementById('date-select'),
    contractSelect: document.getElementById('contract-select'),
    expirySelect: document.getElementById('expiry-select'),
    typeSelect: document.getElementById('type-select'),
    strikeSelect: document.getElementById('strike-select'),
    queryBtn: document.getElementById('query-btn'),
    chartContainerDay: document.getElementById('priceChartDay'),
    chartContainerNight: document.getElementById('priceChartNight'),
    noDataMsgDay: document.getElementById('no-data-msg-day'),
    noDataMsgNight: document.getElementById('no-data-msg-night'),
    uploadZone: document.getElementById('uploadZone'),
    csvFileInput: document.getElementById('csvFileInput'),
    uploadText: document.getElementById('uploadText'),
    statVolume: document.getElementById('stat-volume'),
    statHigh: document.getElementById('stat-high'),
    statLow: document.getElementById('stat-low')
};

let priceChartDay = null;
let priceChartNight = null;

let globalRawData = [];
let uniqueValues = {
    dates: new Set(),
    contracts: new Set(),
    expiries: new Set(),
    types: new Set(),
    strikes: new Set()
};

els.uploadZone.addEventListener('click', () => els.csvFileInput.click());
els.uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    els.uploadZone.style.borderColor = 'var(--accent)';
});
els.uploadZone.addEventListener('dragleave', e => {
    e.preventDefault();
    els.uploadZone.style.borderColor = '';
});
els.uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    els.uploadZone.style.borderColor = '';
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});
els.csvFileInput.addEventListener('change', e => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('請上傳 CSV 檔案');
        return;
    }
    
    els.uploadText.textContent = '解析資料中，請稍候...';
    
    const dateMatch = file.name.match(/OptionsDaily_(\d{4})_?(\d{2})_?(\d{2})/i);
    const tradingDateFromFilename = dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : null;

    Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: function(results) {
            processCSV(results.data, tradingDateFromFilename);
            els.uploadText.textContent = `已載入: ${file.name}`;
            els.uploadZone.style.background = 'rgba(56, 161, 105, 0.1)';
            els.uploadZone.style.borderColor = 'var(--success)';
        },
        error: function(err) {
            console.error('PapaParse error:', err);
            els.uploadText.textContent = '解析失敗，請重新上傳';
        }
    });
}

function processCSV(rows, tradingDateFromFilename) {
    globalRawData = [];
    uniqueValues = { dates: new Set(), contracts: new Set(), expiries: new Set(), types: new Set(), strikes: new Set() };

    for (let i = 2; i < rows.length; i++) { // Skip first 2 header rows
        const parts = rows[i];
        if (parts.length < 8) continue;

        const date = tradingDateFromFilename || parts[0].trim();
        const contract = parts[1].trim();
        
        if (contract !== 'TXO') continue; // Only load TXO

        const strike = parts[2].trim();
        const type = parts[3].trim() === '買權' ? 'C' : 'P';
        const expiry = parts[4].trim().replace(/\s+/g, '');
        const timeStr = parts[5].trim(); // HHMMSS
        const price = parseFloat(parts[6].trim());
        const qty = parseInt(parts[7].trim(), 10);

        if (isNaN(price) || isNaN(qty)) continue;

        let hhmm = timeStr.substring(0, 4);

        let calendarDate = date;
        const hour = parseInt(hhmm.substring(0, 2), 10);
        if (hour >= 15 || hour <= 23) {
            const y = parseInt(date.substring(0, 4), 10);
            const m = parseInt(date.substring(4, 6), 10) - 1;
            const d = parseInt(date.substring(6, 8), 10);
            const dateObj = new Date(y, m, d);
            dateObj.setDate(dateObj.getDate() - 1);
            const py = dateObj.getFullYear();
            const pm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const pd = String(dateObj.getDate()).padStart(2, '0');
            calendarDate = `${py}${pm}${pd}`;
        }

        uniqueValues.dates.add(date);
        uniqueValues.contracts.add(contract);
        uniqueValues.expiries.add(expiry);
        uniqueValues.types.add(type);
        uniqueValues.strikes.add(strike);

        globalRawData.push({
            tradingDate: date,
            calendarDate: calendarDate,
            contract: contract,
            expiry: expiry,
            strike: strike,
            type: type,
            timeStr: timeStr,
            hhmm: hhmm,
            price: price,
            qty: qty
        });
    }

    populateDropdowns();
}

function populateDropdowns() {
    const populate = (selectEl, set) => {
        selectEl.innerHTML = '';
        Array.from(set).sort().forEach(val => {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val;
            selectEl.appendChild(opt);
        });
        selectEl.disabled = false;
    };

    populate(els.dateSelect, uniqueValues.dates);
    populate(els.contractSelect, uniqueValues.contracts);
    populate(els.expirySelect, uniqueValues.expiries);
    populate(els.typeSelect, uniqueValues.types);
    
    const sortedStrikes = Array.from(uniqueValues.strikes).sort((a,b) => parseInt(a) - parseInt(b));
    els.strikeSelect.innerHTML = '';
    sortedStrikes.forEach(val => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        els.strikeSelect.appendChild(opt);
    });
    els.strikeSelect.disabled = false;

    if (sortedStrikes.length > 0) {
        const midIndex = Math.floor(sortedStrikes.length / 2);
        els.strikeSelect.value = sortedStrikes[midIndex];
    }

    els.queryBtn.disabled = false;
    handleQuery();
}

els.queryBtn.addEventListener('click', handleQuery);

function handleQuery() {
    const date = els.dateSelect.value;
    const contract = els.contractSelect.value;
    const expiry = els.expirySelect.value;
    const type = els.typeSelect.value;
    const strike = els.strikeSelect.value;

    if (!date || !contract) return;

    els.queryBtn.disabled = true;
    els.queryBtn.textContent = '運算中...';

    setTimeout(() => {
        runAggregation(date, contract, expiry, type, strike);
        els.queryBtn.disabled = false;
        els.queryBtn.textContent = '查詢 (Query)';
    }, 50);
}

function runAggregation(date, contract, expiry, type, strike) {
    const filtered = globalRawData.filter(d => 
        d.tradingDate === date &&
        d.contract === contract &&
        d.expiry === expiry &&
        d.type === type &&
        d.strike === strike
    );

    const ohlcvMap = new Map();
    let totalVolume = 0;
    let highestPrice = -Infinity;
    let lowestPrice = Infinity;

    filtered.forEach(row => {
        const bucketKey = `${row.calendarDate}-${row.hhmm}`;
        
        const y = parseInt(row.calendarDate.substring(0, 4), 10);
        const m = parseInt(row.calendarDate.substring(4, 6), 10) - 1;
        const d = parseInt(row.calendarDate.substring(6, 8), 10);
        const h = parseInt(row.hhmm.substring(0, 2), 10);
        const min = parseInt(row.hhmm.substring(2, 4), 10);
        
        const dateObj = new Date(y, m, d, h, min, 0);
        const unixTimestamp = Math.floor(dateObj.getTime() / 1000);

        if (!ohlcvMap.has(bucketKey)) {
            ohlcvMap.set(bucketKey, {
                time: unixTimestamp,
                open: row.price,
                high: row.price,
                low: row.price,
                close: row.price,
                volume: row.qty,
                hhmm: parseInt(row.hhmm, 10)
            });
        } else {
            const candle = ohlcvMap.get(bucketKey);
            if (row.price > candle.high) candle.high = row.price;
            if (row.price < candle.low) candle.low = row.price;
            candle.close = row.price;
            candle.volume += row.qty;
        }

        totalVolume += row.qty;
        if (row.price > highestPrice) highestPrice = row.price;
        if (row.price < lowestPrice) lowestPrice = row.price;
    });

    els.statVolume.textContent = totalVolume.toLocaleString();
    els.statHigh.textContent = highestPrice === -Infinity ? '-' : highestPrice.toFixed(2);
    els.statLow.textContent = lowestPrice === Infinity ? '-' : lowestPrice.toFixed(2);

    const dataArray = Array.from(ohlcvMap.values()).sort((a, b) => a.time - b.time);
    renderCharts(dataArray);
}

function renderCharts(data) {
    if (priceChartDay) priceChartDay.remove();
    if (priceChartNight) priceChartNight.remove();

    const dayData = [];
    const nightData = [];

    data.forEach(d => {
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
            vertLines: { color: 'rgba(0, 0, 0, 0.06)', style: 1 },
            horzLines: { color: 'rgba(0, 0, 0, 0.04)', style: 1 }
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
    
    chart._ro = ro;
    const originalRemove = chart.remove;
    chart.remove = function() {
        if (this._ro) this._ro.disconnect();
        originalRemove.call(this);
    };

    chart.priceScale('right').applyOptions({
        scaleMargins: {
            top: 0.1,
            bottom: 0.2, 
        },
    });

    const candleSeries = chart.addCandlestickSeries({
        upColor: '#e53e3e',
        downColor: '#059669',
        borderVisible: false,
        wickUpColor: '#e53e3e',
        wickDownColor: '#059669'
    });
    
    const candleData = data.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
    candleSeries.setData(candleData);

    const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', 
    });

    volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.85, 
            bottom: 0,
        },
    });

    const volumeData = data.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(229, 62, 62, 0.4)' : 'rgba(5, 150, 105, 0.4)'
    }));

    volumeSeries.setData(volumeData);
    chart.timeScale().fitContent();
    return chart;
}
