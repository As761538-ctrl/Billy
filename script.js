/*
Baccarat RC Simulator (browser)
- 8 decks shoe, burn card procedure: reveal first card, then burn its pip_value (A=1, 2..9 numeric, 10/J/Q/K=10)
- Visible RC counts only visible cards (first revealed card counts as visible), true RC counts all removed cards
- Simulate shoes until targetRounds achieved or many shoes
- Displays first 200 rounds, RC time series, summary table, and allows CSV download
*/

const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const burn_value = {};
ranks.forEach(r => { burn_value[r] = (r==="A"?1: (["10","J","Q","K"].includes(r)?10: parseInt(r))); });
const rc_weight = {"A":1,"2":1,"3":2,"4":3,"5":-2,"6":-2,"7":-2,"8":-1,"9":0,"10":0,"J":0,"Q":0,"K":0};
const baccarat_points = {"A":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":0,"J":0,"Q":0,"K":0};

function initShoe(decks=8){
  const shoe = [];
  for(let d=0; d<decks; d++){
    for(const r of ranks){
      for(let i=0;i<4;i++) shoe.push(r);
    }
  }
  // shuffle Fisher-Yates
  for(let i=shoe.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    const t = shoe[i]; shoe[i]=shoe[j]; shoe[j]=t;
  }
  return shoe;
}

function drawOne(shoe){
  return shoe.shift();
}

function handScore(cards){
  return cards.reduce((s,c)=>s + baccarat_points[c],0) % 10;
}

function simulateOneShoe(maxRoundsInShoe=500){
  let shoe = initShoe(8);
  const total_cards = shoe.length;
  const cut_frac = Math.random()*(0.75-0.65)+0.65;
  const cut_pos = Math.floor(total_cards*cut_frac);
  const stop_threshold = total_cards - cut_pos;

  // reveal first card (visible)
  const first = drawOne(shoe);
  let visible_rc = 0;
  let true_rc = 0;
  visible_rc += (rc_weight[first]||0);
  true_rc += (rc_weight[first]||0);
  // burn next burn_count cards (hidden)
  const burn = burn_value[first] || 0;
  const burned_cards = [];
  for(let i=0;i<burn;i++){
    const c = drawOne(shoe);
    if(c===undefined) break;
    burned_cards.push(c);
    true_rc += (rc_weight[c]||0);
  }

  const records = [];
  let rounds = 0;
  while(shoe.length > stop_threshold && shoe.length >= 6 && rounds < maxRoundsInShoe){
    // deal initial four cards: Player, Banker, Player, Banker
    const player = [drawOne(shoe), drawOne(shoe)];
    const banker = [drawOne(shoe), drawOne(shoe)];
    for(const c of [...player, ...banker]){
      visible_rc += (rc_weight[c]||0);
      true_rc += (rc_weight[c]||0);
    }
    let p_score = handScore(player);
    let b_score = handScore(banker);
    let winner = null;
    if(p_score===8 || p_score===9 || b_score===8 || b_score===9){
      winner = (p_score>b_score?"Player": (b_score>p_score?"Banker":"Tie"));
    } else {
      // player draw rule
      let player_third = null;
      if(p_score <= 5){
        player_third = drawOne(shoe);
        if(player_third){
          player.push(player_third);
          visible_rc += (rc_weight[player_third]||0);
          true_rc += (rc_weight[player_third]||0);
          p_score = handScore(player);
        }
      }
      // banker draw rule
      b_score = handScore(banker);
      if(player.length === 2){
        if(b_score <= 5){
          const banker_third = drawOne(shoe);
          if(banker_third){
            banker.push(banker_third);
            visible_rc += (rc_weight[banker_third]||0);
            true_rc += (rc_weight[banker_third]||0);
          }
        }
      } else {
        const third = player[player.length-1];
        const third_val = baccarat_points[third];
        let draw_b = false;
        if(b_score <= 2) draw_b = true;
        else if(b_score === 3 && third_val !== 8) draw_b = true;
        else if(b_score === 4 && third_val >=2 && third_val <=7) draw_b = true;
        else if(b_score === 5 && third_val >=4 && third_val <=7) draw_b = true;
        else if(b_score === 6 && (third_val === 6 || third_val === 7)) draw_b = true;
        if(draw_b){
          const banker_third = drawOne(shoe);
          if(banker_third){
            banker.push(banker_third);
            visible_rc += (rc_weight[banker_third]||0);
            true_rc += (rc_weight[banker_third]||0);
          }
        }
      }
      p_score = handScore(player);
      b_score = handScore(banker);
      winner = (p_score > b_score ? "Player": (b_score > p_score ? "Banker" : "Tie"));
    }
    rounds += 1;
    records.push({
      round_index: rounds,
      winner: winner,
      visible_rc: visible_rc,
      true_rc: true_rc,
      shoe_cards_left: shoe.length
    });
  }
  return {records: records, rounds: rounds};
}

function simulateUntilTarget(targetRounds, maxPerShoe=500){
  let allRecords = [];
  let totalRounds = 0;
  let shoesSimulated = 0;
  while(totalRounds < targetRounds){
    const res = simulateOneShoe(maxPerShoe);
    if(res.rounds === 0) continue;
    shoesSimulated++;
    for(const r of res.records){
      r.global_round = totalRounds + r.round_index;
      allRecords.push(r);
    }
    totalRounds += res.rounds;
    // guard against infinite loop
    if(shoesSimulated > 500) break;
  }
  return {records: allRecords, totalRounds: totalRounds, shoesSimulated: shoesSimulated};
}

// UI helpers
function formatNumber(n){ return Math.round(n*100)/100; }

document.getElementById('runBtn').addEventListener('click', ()=>{
  const target = parseInt(document.getElementById('targetRounds').value) || 1000;
  const maxPerShoe = parseInt(document.getElementById('maxPerShoe').value) || 500;
  runSimulation(target, maxPerShoe);
});

let lastCsv = null;

function runSimulation(target, maxPerShoe){
  document.getElementById('runBtn').disabled = true;
  document.getElementById('runBtn').textContent = '模擬中...';
  setTimeout(()=>{ // allow UI update
    const res = simulateUntilTarget(target, maxPerShoe);
    const df = res.records;
    // compute threshold stats
    const thresholds = [15,20,40];
    const stats = thresholds.map(t=>{
      const trueCross = df.filter(r=>Math.abs(r.true_rc) >= t).length;
      const visCross = df.filter(r=>Math.abs(r.visible_rc) >= t).length;
      return {threshold: t, trueCross: trueCross, visCross: visCross, fractionTrue: trueCross/df.length, fractionVis: visCross/df.length};
    });
    // summary
    const meanTrue = df.reduce((s,r)=>s + r.true_rc,0)/df.length;
    const meanVis = df.reduce((s,r)=>s + r.visible_rc,0)/df.length;
    const stdTrue = Math.sqrt(df.reduce((s,r)=>s + Math.pow(r.true_rc - meanTrue,2),0)/df.length);
    const stdVis = Math.sqrt(df.reduce((s,r)=>s + Math.pow(r.visible_rc - meanVis,2),0)/df.length);
    // render summary
    document.getElementById('statsSection').hidden = false;
    document.getElementById('chartSection').hidden = false;
    document.getElementById('tableSection').hidden = false;
    const summaryDiv = document.getElementById('summary');
    summaryDiv.innerHTML = `模擬局數: ${res.totalRounds}，鞋數: ${res.shoesSimulated}<br>mean true RC: ${formatNumber(meanTrue)}, std true RC: ${formatNumber(stdTrue)}<br>mean visible RC: ${formatNumber(meanVis)}, std visible RC: ${formatNumber(stdVis)}`;
    const thrDiv = document.getElementById('thresholds');
    thrDiv.innerHTML = stats.map(s=>`Threshold ${s.threshold}: true=${s.trueCross} (${formatNumber(s.fractionTrue*100)}%), visible=${s.visCross} (${formatNumber(s.fractionVis*100)}%)`).join('<br>');
    // table first 200
    const tbody = document.querySelector('#recordsTable tbody');
    tbody.innerHTML = '';
    const sample = df.slice(0,200);
    for(const r of sample){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.global_round}</td><td>${r.winner}</td><td>${r.visible_rc}</td><td>${r.true_rc}</td><td>${r.shoe_cards_left}</td>`;
      tbody.appendChild(tr);
    }
    // chart using Chart.js
    const labels = sample.map(r=>r.global_round);
    const trueData = sample.map(r=>r.true_rc);
    const visData = sample.map(r=>r.visible_rc);
    const ctx = document.getElementById('rcChart').getContext('2d');
    if(window._rcChart) window._rcChart.destroy();
    window._rcChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {label: 'True RC', data: trueData, borderWidth:1, fill:false},
          {label: 'Visible RC', data: visData, borderWidth:1, fill:false}
        ]
      },
      options: {responsive:true, animation:false, scales:{y:{beginAtZero:false}}}
    });
    // prepare CSV
    const csvRows = [];
    csvRows.push(['global_round','winner','visible_rc','true_rc','shoe_cards_left'].join(','));
    for(const r of df){
      csvRows.push([r.global_round,r.winner,r.visible_rc,r.true_rc,r.shoe_cards_left].join(','));
    }
    lastCsv = csvRows.join('\\n');
    document.getElementById('downloadCsv').disabled = false;
    document.getElementById('runBtn').disabled = false;
    document.getElementById('runBtn').textContent = '開始模擬';
  }, 50);
}

document.getElementById('downloadCsv').addEventListener('click', ()=>{
  if(!lastCsv) return;
  const blob = new Blob([lastCsv], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'baccarat_rc_simulation.csv';
  a.click();
  URL.revokeObjectURL(url);
});
