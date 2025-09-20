import Papa from 'papaparse';
import { Chart } from 'chart.js/auto';

const base = import.meta.env.BASE_URL;
const GRAPH_CSV = base + 'data/RRPI_calculated.csv';
const PRICE_CSV = base + 'data/median_prices.csv';

const $ = s => document.querySelector(s);

let chart = null;
let graphRows = [];
let priceRows = [];
let currentBasePeriod = { year: 2009, quarter: 1 };

(async function init(){
  const [gText, pText] = await Promise.all([
    fetch(GRAPH_CSV).then(r=>r.text()),
    fetch(PRICE_CSV).then(r=>r.text()),
  ]);

  graphRows = Papa.parse(gText, { header:true, skipEmptyLines:true }).data.map(r=>({
    Year: Number(r['Year']),
    Quarter: String(r['Quarter']).trim(),
    Raw_CPI: Number(r['Raw_CPI']),
    CPI: Number(r['CPI']),
    Nominal_RPI: Number(r['Nominal_RPI']),
    Real_RPI: Number(r['Real_RPI']),
    Real_Change: Number(r['Real_Change']),
  })).filter(r=>Number.isFinite(r.Year));

  graphRows = graphRows.map(r=>{
    const qn = /^Q?(\d)$/.test(r.Quarter)? Number(r.Quarter.replace('Q','')) : Number(r.Quarter);
    return { ...r, Qnum: qn, Label: `${r.Year} Q${qn}` };
  }).filter(r=>[1,2,3,4].includes(r.Qnum));

  priceRows = Papa.parse(pText, { header:true, skipEmptyLines:true }).data.map(r=>({
    year: Number(r['year']),
    quarter: Number(String(r['quarter']).replace('Q','')),
    town: String(r['town']).trim(),
    flat_type: String(r['flat_type']).trim(),
    price: Number(r['price'])
  })).filter(r=>r.town && r.flat_type && [1,2,3,4].includes(r.quarter));

  populateYearDropdowns();
  populatePriceSelectors();
  attachHandlers();
})();

function populateYearDropdowns(){
  if(!graphRows.length) return;
  const years = Array.from(new Set(graphRows.map(r=>r.Year))).sort((a,b)=>a-b);
  $('#startYear').innerHTML = years.map(y=>`<option>${y}</option>`).join('');
  $('#endYear').innerHTML = years.map(y=>`<option>${y}</option>`).join('');
  $('#baseYear').innerHTML = years.map(y=>`<option>${y}</option>`).join('');
  $('#startYear').value = years[0];
  $('#endYear').value = years[years.length-1];
  $('#baseYear').value = 2009; // Default base year
}

function populatePriceSelectors(){
  if(!priceRows.length) return;
  const towns = Array.from(new Set(priceRows.map(r=>r.town))).sort();
  const flats = Array.from(new Set(priceRows.map(r=>r.flat_type))).sort();
  const years = Array.from(new Set(priceRows.map(r=>r.year))).sort((a,b)=>a-b);
  const fill = (id, arr)=>{ const el=document.getElementById(id); if(!el) return; el.innerHTML = arr.map(v=>`<option value="${v}">${v}</option>`).join(''); };
  fill('townSel', towns);
  fill('flatTypeSel', flats);
  fill('yearSel', years);
}

function attachHandlers(){
  $('#btnPlot').addEventListener('click', plotRange);
  $('#btnReset').addEventListener('click', ()=>{ 
    if(chart){chart.destroy(); chart=null;} 
    $('#rangeLabel').textContent='Select a range to plot'; 
  });
  $('#setBase').addEventListener('click', updateBasePeriod);
  ['flatTypeSel','townSel','yearSel','quarterSel'].forEach(id=>{ const el=document.getElementById(id); el && el.addEventListener('change', updatePriceSentence); });
}

function plotRange(){
  if(!graphRows.length) return;
  const startY = Number($('#startYear').value);
  const endY   = Number($('#endYear').value);
  const startQ = Number($('#startQuarter').value);
  const endQ   = Number($('#endQuarter').value);
  const key = (y,q)=>y*10+q;
  const A = key(startY,startQ), B = key(endY,endQ);
  const [lo,hi] = A<=B ? [A,B] : [B,A];
  const rows = graphRows.filter(r=>key(r.Year,r.Qnum)>=lo && key(r.Year,r.Qnum)<=hi)
    .sort((a,b)=>key(a.Year,a.Qnum)-key(b.Year,a.Qnum));
  
  const labels = rows.map(r=>r.Label);
  // Use new_RRPI if available, otherwise fallback to Real_RPI
  const realData = rows.map(r => {
    console.log(`Row ${r.Label}:`, r.new_RRPI); // Debug log
    return r.new_RRPI !== undefined ? r.new_RRPI : r.Real_RPI;
  });
  const nominalData = rows.map(r => r.new_RPI !== undefined ? r.new_RPI : r.Nominal_RPI);
  
  $('#rangeLabel').textContent = labels.length? 
    `Plotting RPI: ${labels[0]} → ${labels[labels.length-1]} (Base: ${currentBasePeriod.year} Q${currentBasePeriod.quarter})` : 
    'No data in range';
    
  drawChart(labels, [
    { label: 'Nominal RPI', data: nominalData, borderColor: '#4c6161' },
    { label: 'Real RPI', data: realData, borderColor: '#8344c2' }
  ]);
}

function drawChart(labels, datasets){
  const ctx = document.getElementById('chart');
  if(chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { 
      labels, 
      datasets: datasets.map(ds => ({ 
        ...ds, 
        tension: .2, 
        spanGaps: true, 
        pointRadius: 0,
        pointHoverRadius: 6,
        pointBackgroundColor: ds.borderColor,      // Set point background color
        pointBorderColor: ds.borderColor,          // Set point border color
        pointHoverBackgroundColor: ds.borderColor, // Set hover background color
        pointHoverBorderColor: ds.borderColor,     // Set hover border color
        pointHoverBorderWidth: 0                   // Remove border on hover
      })) 
    },
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      interaction: { 
        mode: 'index', 
        intersect: false 
      },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            pointStyle: 'rect',
            boxWidth: 15,
            boxHeight: 15,
            generateLabels: (chart) => {
              const datasets = chart.data.datasets;
              return datasets.map(dataset => ({
                text: dataset.label,
                fillStyle: dataset.borderColor,
                strokeStyle: dataset.borderColor,
                lineWidth: 0,
                index: datasets.indexOf(dataset)
              }));
            }
          },
          onClick: null // Disable legend click handling
        }
      },
      scales: { 
        y: { 
          title: { 
            display: true, 
            text: 'Index (Q1 2009=100)'
          } 
        } 
      } 
    }
  });
}

function updateBasePeriod() {
  const baseYear = Number($('#baseYear').value);
  const baseQuarter = Number($('#baseQuarter').value);
  
  console.log('Updating base period to:', baseYear, 'Q' + baseQuarter); // Debug log
  
  const baseRow = graphRows.find(r => r.Year === baseYear && r.Qnum === baseQuarter);
  if (!baseRow) {
    console.log('Base row not found!'); // Debug log
    return;
  }
  
  // Calculate multipliers
  const cpiMultiplier = 100 / baseRow.Raw_CPI;
  const rpiMultiplier = 100 / baseRow.Nominal_RPI;
  
  // Update all rows with new calculations
  graphRows = graphRows.map(row => ({
    ...row,
    new_CPI: row.Raw_CPI * cpiMultiplier,
    new_RPI: row.Nominal_RPI * rpiMultiplier,
    new_RRPI: ((row.Nominal_RPI * rpiMultiplier) / (row.Raw_CPI * cpiMultiplier)) * 100
  }));
  
  currentBasePeriod = { year: baseYear, quarter: baseQuarter };
  plotRange(); // Refresh the graph
}

function updatePriceSentence(){
  const townEl = document.getElementById('townSel');
  const flatEl = document.getElementById('flatTypeSel');
  const yearEl = document.getElementById('yearSel');
  const qEl    = document.getElementById('quarterSel');
  const hint   = document.getElementById('priceHint');
  const out    = document.getElementById('priceOut');
  const town = townEl?.value; const flat = flatEl?.value; const year = Number(yearEl?.value); const quarter = Number(qEl?.value);
  if(!town || !flat || !year || !quarter){ out.textContent = '—'; hint.textContent = 'Select all fields to see the price.'; return; }
  const row = priceRows.find(r=> r.town===town && r.flat_type===flat && r.year===year && r.quarter===quarter );
  if(!row){ out.textContent='—'; hint.textContent='No matching price found.'; return; }
  out.textContent = row.price.toLocaleString(); hint.textContent='';
}
