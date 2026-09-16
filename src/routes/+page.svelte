<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { RiksdagPollResponse, RiksdagResult } from '$lib/types';
  import ElectionCard from '$lib/components/ElectionCard.svelte';
  import { 
    RefreshCw, 
    Search, 
    Vote, 
    TrendingUp, 
    TrendingDown, 
    Minus,
    Sparkles, 
    AlertCircle, 
    CheckCircle2,
    ShieldAlert,
    Users,
    ChevronDown
  } from 'lucide-svelte';

  let pollData: RiksdagPollResponse | null = null;
  let loading = true;
  let error: string | null = null;
  let searchInput = '';
  let showFullComparison = false;

  let consecutiveErrors = 0;
  let retryBackoffSeconds = 0;
  let countdown = 30;
  let timer: any = null;

  async function fetchPollData() {
    loading = true;
    try {
      const res = await fetch('/api/poll/riksdag');
      const data: RiksdagPollResponse = await res.json().catch(() => null);
      if (!res.ok || !data || data.status === 'error') {
        throw new Error(data?.errorDetails || `HTTP error! status: ${res?.status || 504}`);
      }
      error = null;
      consecutiveErrors = 0;
      retryBackoffSeconds = 0;
      pollData = data;
      countdown = 30;
    } catch (e: any) {
      consecutiveErrors++;
      error = e.message || 'Kunde inte hämta Riksdagsresultat';
      // val.se rate limit (429) cooldown is 60 seconds. Wait 60s directly to allow rate limit to clear cleanly.
      retryBackoffSeconds = 60;
      countdown = retryBackoffSeconds;
    } finally {
      loading = false;
    }
  }

  function handleManualRetry() {
    consecutiveErrors = 0;
    error = null;
    fetchPollData();
  }

  let isMounted = false;

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('val_filter_riksdag');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.searchInput !== undefined) searchInput = parsed.searchInput;
          if (parsed.comparisonMode) comparisonMode = parsed.comparisonMode;
        }
      } catch (e) {}
    }
    isMounted = true;
    fetchPollData();
    timer = setInterval(() => {
      if (countdown > 0) {
        countdown--;
      } else if (!loading) {
        fetchPollData();
      }
    }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  $: if (isMounted && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('val_filter_riksdag', JSON.stringify({
        searchInput,
        comparisonMode
      }));
    } catch (e) {}
  }

  function formatNumber(num: number | undefined): string {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('sv-SE');
  }

  function formatDiffNum(num: number | undefined, suffix: string = ''): { text: string; color: string } {
    if (num === undefined || num === null || num === 0) {
      return { text: `±0${suffix}`, color: 'text-slate-500' };
    }
    if (num > 0) {
      return { text: `+${num.toLocaleString('sv-SE')}${suffix}`, color: 'text-emerald-600 font-extrabold' };
    }
    return { text: `${num.toLocaleString('sv-SE')}${suffix}`, color: 'text-rose-600 font-extrabold' };
  }

  let comparisonMode: 'preliminary' | 'previous' = 'preliminary';

  $: national = pollData?.nationalResult;
  $: diffPrelim = pollData?.diffVsPreliminary;
  $: diffPrev = pollData?.diffVsPrevious;
  $: activeDiff = comparisonMode === 'preliminary' ? diffPrelim : diffPrev;

  $: filteredValkretsar = (pollData?.valkretsar || []).filter((vk) => {
    const term = searchInput.trim().toLowerCase();
    if (!term) return true;
    return vk.name.toLowerCase().includes(term) || vk.code.includes(term);
  });
</script>

<svelte:head>
  <title>Miljöpartiet – Riksdagsvalet</title>
</svelte:head>

<main class="max-w-4xl mx-auto px-4 py-6 space-y-6">
  <!-- Page Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
    <div>
      <div class="flex items-center gap-2 mb-1">
        <span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-300/50">
          <Vote class="w-3.5 h-3.5 text-emerald-700" />
          Riksdagsvalet {pollData?.electionYear || '2026'}
        </span>
        {#if pollData}
          <span class="text-xs font-semibold text-slate-500">
            {pollData.countingPhase}
          </span>
        {/if}
      </div>
      <h1 class="text-2xl font-black text-slate-900 tracking-tight">
        Riksdagsvalet & Jämförelse i räknade distrikt
      </h1>
      <p class="text-xs text-slate-500 mt-0.5">
        Live-uppföljning av MP:s riksdagsmandat och röstjämförelse mot preliminärräkning och förra valet i räknade distrikt.
      </p>
    </div>

    <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
      <button 
        on:click={fetchPollData}
        disabled={loading}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition disabled:opacity-50"
      >
        <RefreshCw class="w-3.5 h-3.5 {loading ? 'animate-spin' : ''}" />
        <span>Uppdatera</span>
      </button>
    </div>
  </div>

  {#if error}
    <div class="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm space-y-3">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
        <div class="flex items-start gap-3">
          <AlertCircle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong class="font-bold text-sm block">Anslutningsfel mot val.se (Rate limit / Timeout)</strong>
            <span class="text-xs text-amber-800 font-mono">{error}</span>
          </div>
        </div>

        <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <span class="text-xs bg-amber-200/80 border border-amber-300 px-3 py-1.5 rounded-xl font-medium text-amber-900 flex items-center gap-1.5">
            <RefreshCw class="w-3.5 h-3.5 text-amber-700 {loading ? 'animate-spin' : ''}" />
            <span>Försöker igen om <strong class="font-mono font-bold text-amber-950">{countdown}s</strong></span>
          </span>

          <button 
            on:click={handleManualRetry}
            disabled={loading}
            class="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            Försök igen nu
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if loading && !pollData}
    <div class="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
      <RefreshCw class="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
      <p class="text-sm font-semibold text-slate-600">Hämtar resultat för Riksdagen...</p>
    </div>
  {:else if national}
    <!-- National MP Summary Card & Comparison Diff Box -->
    <div class="bg-emerald-950 text-white p-5 sm:p-6 rounded-2xl border border-emerald-800 shadow-md space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-800/80 pb-4">
        <div>
          <span class="text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider block">Nationellt resultat för MP</span>
          <h2 class="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
            <span>Miljöpartiet de gröna i Riksdagen</span>
          </h2>
        </div>

        <div class="flex items-center gap-3">
          <div class="bg-emerald-900/80 px-4 py-2 rounded-xl border border-emerald-700/60 text-center">
            <span class="block text-[10px] text-emerald-300 uppercase font-extrabold tracking-wider">Mandat</span>
            <span class="text-2xl font-black text-white">{national.mpMandates}</span>
            <span class="block text-[10px] text-emerald-200">av 349</span>
          </div>

          <div class="bg-emerald-900/80 px-4 py-2 rounded-xl border border-emerald-700/60 text-center">
            <span class="block text-[10px] text-emerald-300 uppercase font-extrabold tracking-wider">Röstandel</span>
            <span class="text-2xl font-black {national.mpVotesPct >= 4.0 ? 'text-emerald-300' : 'text-amber-300'}">
              {national.mpVotesPct.toFixed(2)}%
            </span>
            <span class="block text-[10px] text-emerald-200">4,0% spärr</span>
          </div>
        </div>
      </div>

      <!-- Slutgiltig Rösträkning Diff Box (Comparison vs Preliminary or 2022) -->
      {#if activeDiff}
        <div class="bg-emerald-900/50 p-4 rounded-xl border border-emerald-700/60 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-1.5">
              <Sparkles class="w-4 h-4 text-emerald-300" />
              <h3 class="text-xs font-extrabold uppercase tracking-wider text-emerald-200">
                Jämförelse i räknade distrikt ({activeDiff.districtsCounted || 0} av {activeDiff.districtsTotal || 0})
              </h3>
            </div>

            <!-- Comparison Mode Switcher -->
            <div class="inline-flex bg-emerald-950/90 p-1 rounded-lg border border-emerald-800 text-xs">
              <button
                type="button"
                on:click={() => comparisonMode = 'preliminary'}
                class="px-2.5 py-1 rounded font-bold transition {comparisonMode === 'preliminary' ? 'bg-emerald-500 text-emerald-950 shadow' : 'text-emerald-300 hover:text-white'}"
              >
                vs Preliminärt
              </button>
              <button
                type="button"
                on:click={() => comparisonMode = 'previous'}
                class="px-2.5 py-1 rounded font-bold transition {comparisonMode === 'previous' ? 'bg-emerald-500 text-emerald-950 shadow' : 'text-emerald-300 hover:text-white'}"
              >
                vs Förra valet (2022)
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
            <!-- MP Röster -->
            <div class="bg-emerald-950/80 p-3 rounded-lg border border-emerald-800/80">
              <span class="block text-[11px] text-emerald-300 font-semibold mb-0.5">MP Röster</span>
              <span class="text-lg font-black block text-white">
                {formatNumber(activeDiff.finalVotes)}
              </span>
              <div class="text-xs mt-1 flex flex-col items-center justify-center gap-0.5">
                <span class="text-emerald-300 text-[10px]">
                  {comparisonMode === 'preliminary' ? 'Preliminärt' : '2022'}: {formatNumber(activeDiff.comparisonVotes)}
                </span>
                <span class="font-bold text-xs bg-emerald-900 px-1.5 py-0.5 rounded border border-emerald-700 {activeDiff.votesDiff > 0 ? 'text-emerald-300' : activeDiff.votesDiff < 0 ? 'text-rose-300' : 'text-slate-300'}">
                  {activeDiff.votesDiff > 0 ? '+' : ''}{formatNumber(activeDiff.votesDiff)} röster
                </span>
              </div>
            </div>

            <!-- Röstandel (+/-) -->
            <div class="bg-emerald-950/80 p-3 rounded-lg border border-emerald-800/80">
              <span class="block text-[11px] text-emerald-300 font-semibold mb-0.5">Röstandel (%)</span>
              <span class="text-lg font-black block text-white">
                {activeDiff.finalVotesPct.toFixed(2)}%
              </span>
              <div class="text-xs mt-1 flex flex-col items-center justify-center gap-0.5">
                <span class="text-emerald-300 text-[10px]">
                  {comparisonMode === 'preliminary' ? 'Preliminärt' : '2022'}: {activeDiff.comparisonVotesPct.toFixed(2)}%
                </span>
                <span class="font-bold text-xs bg-emerald-900 px-1.5 py-0.5 rounded border border-emerald-700 {activeDiff.votesPctDiff > 0 ? 'text-emerald-300' : activeDiff.votesPctDiff < 0 ? 'text-rose-300' : 'text-slate-300'}">
                  {activeDiff.votesPctDiff > 0 ? '+' : ''}{activeDiff.votesPctDiff.toFixed(2)}%
                </span>
              </div>
            </div>

            <!-- Mandat (+/-) -->
            <div class="bg-emerald-950/80 p-3 rounded-lg border border-emerald-800/80">
              <span class="block text-[11px] text-emerald-300 font-semibold mb-0.5">Mandat</span>
              <span class="text-lg font-black block text-white">
                {national.mpMandates} mandat
              </span>
              <div class="text-xs mt-1 flex flex-col items-center justify-center gap-0.5">
                {#if comparisonMode === 'preliminary' && diffPrelim}
                  <span class="text-emerald-300 text-[10px]">Preliminärt: {diffPrelim.preliminaryMandates}</span>
                  <span class="font-bold text-xs bg-emerald-900 px-1.5 py-0.5 rounded border border-emerald-700 {diffPrelim.mandatesDiff > 0 ? 'text-emerald-300' : diffPrelim.mandatesDiff < 0 ? 'text-rose-300' : 'text-slate-300'}">
                    {diffPrelim.mandatesDiff > 0 ? '+' : ''}{diffPrelim.mandatesDiff}
                  </span>
                {:else}
                  <span class="text-emerald-300 text-[10px]">2022: {national.mpMandates - national.mpMandatesChange}</span>
                  <span class="font-bold text-xs bg-emerald-900 px-1.5 py-0.5 rounded border border-emerald-700 {national.mpMandatesChange > 0 ? 'text-emerald-300' : national.mpMandatesChange < 0 ? 'text-rose-300' : 'text-slate-300'}">
                    {national.mpMandatesChange > 0 ? '+' : ''}{national.mpMandatesChange}
                  </span>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- Spärrindikator (4.0% Riksdagen) -->
      <div class="bg-emerald-900/30 p-3.5 rounded-xl border border-emerald-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2">
          {#if national.mpVotesPct >= 4.0}
            <CheckCircle2 class="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span class="font-bold text-white block">Säkert över riksdagsspärren (4,0%)</span>
              <span class="text-emerald-300 text-[11px]">
                +{formatNumber(national.votesDiffFromThreshold)} röster tillgodo ovanför spärren.
              </span>
            </div>
          {:else}
            <ShieldAlert class="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span class="font-bold text-amber-300 block">Under riksdagsspärren (4,0%)</span>
              <span class="text-amber-200 text-[11px]">
                Saknar {formatNumber(Math.abs(national.votesDiffFromThreshold))} röster för att nå 4,0%.
              </span>
            </div>
          {/if}
        </div>

        <div class="text-right shrink-0">
          <span class="text-emerald-300 text-[11px] block">Räknade distrikt i Riket</span>
          <span class="font-black text-white text-xs">
            {formatNumber(national.districtsCounted)} / {formatNumber(national.districtsTotal)}
            ({Math.round((national.districtsCounted / (national.districtsTotal || 1)) * 100)}%)
          </span>
        </div>
      </div>
    </div>

    <!-- Active Valkretsar Notice & Search Bar -->
    <div class="space-y-3">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-sm">
        <div class="flex items-center gap-2">
          <span class="p-2 bg-indigo-50 rounded-xl text-indigo-700">
            <Users class="w-4 h-4" />
          </span>
          <div>
            <h3 class="text-sm font-bold text-slate-900">
              Påbörjade Riksdagvalkretsar ({filteredValkretsar.length})
            </h3>
            <p class="text-[11px] text-slate-500">
              Visar endast valkretsar där rösträkningen har påbörjats (distrikt &gt; 0). Ej påbörjade valkretsar exkluderas.
            </p>
          </div>
        </div>

        <!-- Search input -->
        <div class="relative w-full sm:w-64">
          <Search class="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Sök valkrets (t.ex. Stockholm)..."
            bind:value={searchInput}
            class="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
          />
        </div>
      </div>

      <!-- Valkrets Grid -->
      {#if filteredValkretsar.length === 0}
        <div class="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
          <AlertCircle class="w-8 h-8 text-amber-500 mx-auto" />
          <h4 class="font-bold text-slate-800 text-sm">Inga valkretsar med påbörjad räkning ännu</h4>
          <p class="text-xs text-slate-500 max-w-md mx-auto">
            Rösträkningen har inte påbörjats i någon av sökta valkretsar. Så fort rösterna börjar trilla in visas de här!
          </p>
        </div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {#each filteredValkretsar as vk (vk.code)}
            <ElectionCard item={vk} type="riksdag" />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</main>
