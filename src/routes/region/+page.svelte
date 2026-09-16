<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PollResponse, RegionResult } from '$lib/types';
  import ElectionCard from '$lib/components/ElectionCard.svelte';
  import SummaryMetricsBar from '$lib/components/SummaryMetricsBar.svelte';
  import { 
    RefreshCw, 
    CheckCircle2, 
    XCircle, 
    Search, 
    Zap, 
    Globe, 
    Clock, 
    Award, 
    Vote, 
    ChevronRight,
    SlidersHorizontal,
    AlertCircle,
    Target,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Sparkles,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
  } from 'lucide-svelte';

  let pollData: PollResponse | null = null;
  let lastSuccessfulLivePollData: PollResponse | null = null;
  let isLoading = false;
  let errorMsg = '';
  let consecutiveErrors = 0;
  let retryBackoffSeconds = 0;
  
  // Controls
  let pollPhase: 'preliminary' | 'final' = 'preliminary';
  let pollIntervalSeconds = 300; // Default 5 minutes for dashboard polling
  let countdown = pollIntervalSeconds;
  let countdownTimer: any = null;

  // Search, Filters & Sorting
  let searchQuery = '';
  let activeTab: 'all' | 'secured' | 'below_threshold' | 'new_regions' | 'without_mandate_prev' = 'all';

  type SortKey = 'name' | 'mandates' | 'votesPct' | 'pctChange';
  type SortOrder = 'asc' | 'desc';

  let sortKey: SortKey = 'name';
  let sortOrder: SortOrder = 'asc';

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Namn' },
    { key: 'mandates', label: 'Antal mandat' },
    { key: 'votesPct', label: 'Röstandel' },
    { key: 'pctChange', label: 'Ökning' }
  ];

  function setSort(key: SortKey) {
    if (sortKey === key) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortOrder = key === 'name' ? 'asc' : 'desc';
    }
  }

  async function fetchPollData() {
    isLoading = true;

    try {
      const res = await fetch(`/api/poll?phase=${pollPhase}`);
      const data: PollResponse = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const detail = data?.errorDetails || `HTTP ${res?.status || 504}: Timeout vid anrop till val.se`;
        throw new Error(detail);
      }

      // Successful poll
      errorMsg = '';
      consecutiveErrors = 0;
      retryBackoffSeconds = 0;
      pollData = data;

      countdown = pollIntervalSeconds;
    } catch (err: any) {
      consecutiveErrors++;
      errorMsg = err?.message || 'Timeout vid anrop till val.se';
      // val.se rate limit (429) cooldown is 60 seconds. Wait 60s directly to allow rate limit to clear cleanly.
      retryBackoffSeconds = 60;
      countdown = retryBackoffSeconds;
    } finally {
      isLoading = false;
    }
  }

  function startPolling() {
    stopPolling();
    fetchPollData();

    // 1-second ticker for countdown and automated retry
    countdownTimer = setInterval(() => {
      if (countdown > 0) {
        countdown--;
      } else if (!isLoading) {
        fetchPollData();
      }
    }, 1000);
  }

  function stopPolling() {
    if (countdownTimer) clearInterval(countdownTimer);
  }

  function handlePhaseChange(phase: 'preliminary' | 'final') {
    if (pollPhase === phase) return;
    pollPhase = phase;
    pollData = null;
    errorMsg = '';
    consecutiveErrors = 0;
    retryBackoffSeconds = 0;
    startPolling();
  }

  function handleIntervalChange(seconds: number) {
    pollIntervalSeconds = seconds;
    if (consecutiveErrors === 0) {
      countdown = seconds;
    }
    startPolling();
  }

  function handleManualRetry() {
    consecutiveErrors = 0;
    errorMsg = '';
    fetchPollData();
  }

  let isMounted = false;

  onMount(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('val_filter_region');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.searchQuery !== undefined) searchQuery = parsed.searchQuery;
          if (parsed.activeTab) activeTab = parsed.activeTab;
          if (parsed.sortKey) sortKey = parsed.sortKey;
          if (parsed.sortOrder) sortOrder = parsed.sortOrder;
          if (parsed.pollPhase) pollPhase = parsed.pollPhase;
        }
      } catch (e) {}
    }
    isMounted = true;
    loadCoalitionsFromStorage();
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });

  $: if (isMounted && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('val_filter_region', JSON.stringify({
        searchQuery,
        activeTab,
        sortKey,
        sortOrder,
        pollPhase
      }));
    } catch (e) {}
  }

  // Filtered & sorted regions calculation
  $: filteredRegions = (pollData?.regions || [])
    .filter((r) => {
      const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.code.includes(searchQuery);
      if (!matchesSearch) return false;

      if (activeTab === 'secured') return r.hasMandate;
      if (activeTab === 'below_threshold') return r.mpVotesPct < 3.0;
      if (activeTab === 'new_regions') return r.isNewRegionWithMandate;
      if (activeTab === 'without_mandate_prev') return (r.mpMandates - r.mpMandatesChange) <= 0;
      return true;
    })
    .sort((a, b) => {
      let diff = 0;
      if (sortKey === 'name') {
        diff = a.name.localeCompare(b.name, 'sv');
        return sortOrder === 'asc' ? diff : -diff;
      }

      if (sortKey === 'mandates') {
        diff = b.mpMandates - a.mpMandates;
      } else if (sortKey === 'votesPct') {
        diff = b.mpVotesPct - a.mpVotesPct;
      } else if (sortKey === 'pctChange') {
        diff = b.mpVotesPctChange - a.mpVotesPctChange;
      }

      if (diff !== 0) {
        return sortOrder === 'desc' ? diff : -diff;
      }

      return a.name.localeCompare(b.name, 'sv');
    });

  $: securedCount = (pollData?.regions || []).filter((r) => r.hasMandate).length;
  $: belowThresholdCount = (pollData?.regions || []).filter((r) => r.mpVotesPct < 3.0).length;
  $: newRegionsCount = (pollData?.regions || []).filter((r) => r.isNewRegionWithMandate).length;
  $: withoutMandatePrevCount = (pollData?.regions || []).filter((r) => (r.mpMandates - r.mpMandatesChange) <= 0).length;

  function formatTime(isoString: string) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatCountdown(sec: number): string {
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }

  function formatNumber(num: number | undefined): string {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('sv-SE');
  }

  function formatChangeNum(num: number | undefined): string {
    if (num === undefined || num === null) return '';
    if (num > 0) return `+${num.toLocaleString('sv-SE')}`;
    if (num < 0) return num.toLocaleString('sv-SE');
    return '±0';
  }

  function formatChangePct(num: number | undefined): string {
    if (num === undefined || num === null) return '';
    const formatted = Math.abs(num).toFixed(1).replace('.', ',');
    if (num > 0) return `+${formatted}%`;
    if (num < 0) return `-${formatted}%`;
    return '±0,0%';
  }

  // Majority / Coalition Builder State with LocalStorage Persistence
  const LOCAL_STORAGE_KEY = 'mp_val_coalition_builder_v1';
  let selectedPartiesPerRegion: Record<string, string[]> = {};

  function loadCoalitionsFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        selectedPartiesPerRegion = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load coalition selections from localStorage:', e);
    }
  }

  function saveCoalitionsToStorage(state: Record<string, string[]>) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save coalition selections to localStorage:', e);
    }
  }

  function togglePartyInCoalition(regionCode: string, partyCode: string) {
    const current = selectedPartiesPerRegion[regionCode] || [];
    const updated = current.includes(partyCode)
      ? current.filter((c) => c !== partyCode)
      : [...current, partyCode];

    selectedPartiesPerRegion = {
      ...selectedPartiesPerRegion,
      [regionCode]: updated
    };
    saveCoalitionsToStorage(selectedPartiesPerRegion);
  }

  function clearCoalition(regionCode: string) {
    const next = { ...selectedPartiesPerRegion };
    delete next[regionCode];
    selectedPartiesPerRegion = next;
    saveCoalitionsToStorage(selectedPartiesPerRegion);
  }

  function getCoalitionSummary(region: RegionResult, state: Record<string, string[]>) {
    const selectedCodes = state[region.code] || [];
    if (selectedCodes.length === 0) return null;

    const selectedParties = (region.partyMandates || []).filter((p) => selectedCodes.includes(p.code));
    const coalitionMandates = selectedParties.reduce((sum, p) => sum + p.mandates, 0);
    const totalMandates = region.totalMandates || (region.partyMandates || []).reduce((sum, p) => sum + p.mandates, 0);
    const majorityThreshold = Math.floor(totalMandates / 2) + 1;
    const isMajority = coalitionMandates >= majorityThreshold;
    const diff = majorityThreshold - coalitionMandates;

    return {
      selectedCodes,
      selectedParties,
      coalitionMandates,
      totalMandates,
      majorityThreshold,
      isMajority,
      diff
    };
  }
</script>

<svelte:head>
  <title>MP Regionmandat | Polling val.se</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 text-slate-900 pb-12">
  <!-- Header Banner -->
  <header class="bg-emerald-950 text-white shadow-md border-b border-emerald-800">
    <div class="max-w-4xl mx-auto px-4 py-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-emerald-950 font-bold text-sm">
              MP
            </span>
            <span class="text-xs uppercase tracking-wider text-emerald-300 font-semibold">Valmyndigheten Poller</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold mt-1 tracking-tight text-emerald-50">
            Miljöpartiet i Regionvalen
          </h1>
          <p class="text-emerald-200 text-sm mt-1">
            Realtidsövervakning av MP-mandat och 3%-spärren per region från <span class="font-medium underline decoration-emerald-500">val.se</span>
          </p>
        </div>

        <!-- Mode & Poll Button -->
        <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button 
            on:click={() => handleManualRetry()}
            disabled={isLoading}
            class="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold rounded-lg shadow transition disabled:opacity-50 text-sm"
          >
            <RefreshCw class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" />
            <span>{isLoading ? 'Pollar...' : 'Polla nu'}</span>
          </button>
        </div>
      </div>

      <!-- Live Bar / Controls Row -->
      <div class="mt-6 pt-4 border-t border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200">
        <div class="flex flex-wrap items-center gap-3">
          <!-- Phase Badge -->
          {#if !errorMsg}
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold {pollPhase === 'final' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}">
              <span class="w-2 h-2 rounded-full {pollPhase === 'final' ? 'bg-indigo-400' : 'bg-emerald-400 animate-ping'}"></span>
              {pollPhase === 'final' ? 'Slutgiltig räkning (Länsstyrelsen)' : 'Preliminär räkning (val.se)'}
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium text-xs">
              <AlertTriangle class="w-3.5 h-3.5" />
              Anslutningsproblem
            </span>
          {/if}

          <!-- Timestamp -->
          {#if pollData?.timestamp}
            <span class="flex items-center gap-1">
              <Clock class="w-3.5 h-3.5 text-emerald-400" />
              Senast uppdaterad: <strong class="text-white">{formatTime(pollData.timestamp)}</strong>
            </span>
          {/if}

          <!-- Countdown -->
          <span class="text-emerald-300/80">
            {consecutiveErrors > 0 ? 'Retry om:' : 'Nästa poll om:'} <strong class="text-emerald-100 font-mono text-sm">{formatCountdown(countdown)}</strong>
          </span>
        </div>

        <!-- Räkningstillfälle Switcher (Matching val.se UI) -->
        <div class="flex items-center gap-2 bg-emerald-900/80 p-1.5 rounded-xl border border-emerald-800 self-start sm:self-auto text-xs">
          <span class="text-emerald-300/90 font-medium px-1">Räkningstillfälle:</span>
          <div class="inline-flex bg-emerald-950/80 p-1 rounded-lg border border-emerald-800/60">
            <button 
              on:click={() => handlePhaseChange('preliminary')}
              class="px-3 py-1 rounded-md text-xs font-bold transition {pollPhase === 'preliminary' ? 'bg-emerald-500 text-emerald-950 shadow' : 'text-emerald-300 hover:text-white'}"
            >
              Preliminärt
            </button>
            <button 
              on:click={() => handlePhaseChange('final')}
              class="px-3 py-1 rounded-md text-xs font-bold transition {pollPhase === 'final' ? 'bg-indigo-600 text-white shadow' : 'text-emerald-300 hover:text-white'}"
            >
              Slutgiltigt
            </button>
          </div>
        </div>
      </div>
    </div>
  </header>

  <div class="max-w-4xl mx-auto px-4 mt-6 space-y-6">

    <!-- Timeout / Connection Error Banner with Exponential Backoff Retry -->
    {#if errorMsg}
      <div class="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl shadow-sm space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div class="flex items-start gap-3">
            <AlertCircle class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong class="font-bold text-sm block">Anslutningsfel mot val.se (Timeout)</strong>
              <span class="text-xs text-amber-800 font-mono">{errorMsg}</span>
            </div>
          </div>

          <!-- Exponential Retry Status & Manual Button -->
          <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span class="text-xs bg-amber-200/80 border border-amber-300 px-3 py-1.5 rounded-xl font-medium text-amber-900 flex items-center gap-1.5">
              <RefreshCw class="w-3.5 h-3.5 text-amber-700 {isLoading ? 'animate-spin' : ''}" />
              <span>Försöker igen om <strong class="font-mono font-bold text-amber-950">{countdown}s</strong></span>
              <span class="text-[10px] text-amber-800/80 font-mono">(försök #{consecutiveErrors}, +{retryBackoffSeconds}s fördröjning)</span>
            </span>

            <button 
              on:click={handleManualRetry}
              disabled={isLoading}
              class="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              Försök igen nu
            </button>
          </div>
        </div>

        <!-- Info status line: Stale data retention vs empty state -->
        <div class="pt-2 border-t border-amber-200/80 text-xs text-amber-800 flex items-center gap-1.5">
          {#if pollData}
            <Clock class="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Visar tidigare hämtade resultat från <strong class="text-amber-950 font-mono">{formatTime(pollData.timestamp)}</strong>. Inga nya data kunde hämtas just nu.</span>
          {:else}
            <AlertTriangle class="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Inga tidigare data finns tillgängliga. Inget resultat visas förrän anslutningen till val.se lyckas.</span>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Key Metrics Overview Cards (Mobile Grid) -->
    {#if pollData?.summary}
      <SummaryMetricsBar 
        summary={pollData.summary}
        type="region"
      />
    {/if}

    <!-- Search & Filter Controls -->
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
      <div class="flex flex-col sm:flex-row gap-3">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input 
            type="text" 
            bind:value={searchQuery}
            placeholder="Sök region (t.ex. Stockholm, Skåne)..."
            class="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
          />
        </div>

        <!-- Interval selector -->
        <div class="flex items-center gap-2 text-xs text-slate-600 self-end sm:self-center">
          <SlidersHorizontal class="w-4 h-4 text-slate-400" />
          <span>Intervall:</span>
          <div class="inline-flex bg-slate-100 p-1 rounded-lg">
            {#each [{ sec: 60, label: '1m' }, { sec: 300, label: '5m' }, { sec: 600, label: '10m' }, { sec: 1800, label: '30m' }] as opt}
              <button 
                on:click={() => handleIntervalChange(opt.sec)}
                class="px-2 py-0.5 rounded text-xs font-medium transition {pollIntervalSeconds === opt.sec ? 'bg-white shadow text-emerald-700 font-bold' : 'text-slate-600 hover:text-slate-900'}"
              >
                {opt.label}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
        <button 
          on:click={() => activeTab = 'all'}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition {activeTab === 'all' ? 'bg-emerald-100 text-emerald-900' : 'text-slate-600 hover:bg-slate-100'}"
        >
          Alla ({pollData?.regions?.length || 0})
        </button>
        <button 
          on:click={() => activeTab = 'secured'}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 {activeTab === 'secured' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"
        >
          <CheckCircle2 class="w-3.5 h-3.5" />
          Över spärren ({securedCount})
        </button>
        <button 
          on:click={() => activeTab = 'below_threshold'}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 {activeTab === 'below_threshold' ? 'bg-amber-500 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"
        >
          <Target class="w-3.5 h-3.5" />
          Under spärren ({belowThresholdCount})
        </button>
        <button 
          on:click={() => activeTab = 'new_regions'}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 {activeTab === 'new_regions' ? 'bg-emerald-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"
        >
          <Sparkles class="w-3.5 h-3.5 text-emerald-300" />
          Nya regioner ({newRegionsCount})
        </button>
        <button 
          on:click={() => activeTab = 'without_mandate_prev'}
          class="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 {activeTab === 'without_mandate_prev' ? 'bg-indigo-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}"
        >
          Utan mandat förut ({withoutMandatePrevCount})
        </button>
      </div>

      <!-- Sorting Controls -->
      <div class="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
        <span class="font-bold text-slate-500 mr-1 flex items-center gap-1.5 shrink-0">
          <ArrowUpDown class="w-3.5 h-3.5 text-slate-400" />
          Sortera:
        </span>
        <div class="flex flex-wrap items-center gap-1.5">
          {#each sortOptions as opt}
            <button 
              on:click={() => setSort(opt.key)}
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 {sortKey === opt.key ? 'bg-emerald-800 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}"
            >
              <span>{opt.label}</span>
              {#if sortKey === opt.key}
                {#if sortOrder === 'asc'}
                  <ArrowUp class="w-3 h-3 text-emerald-300 shrink-0" />
                {:else}
                  <ArrowDown class="w-3 h-3 text-emerald-300 shrink-0" />
                {/if}
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Regions Grid (Mobile-First Cards) -->
    {#if isLoading && !pollData}
      <div class="py-12 text-center text-slate-400 space-y-3">
        <RefreshCw class="w-8 h-8 animate-spin mx-auto text-emerald-600" />
        <p class="text-sm">Hämtar regionresultat från val.se...</p>
      </div>
    {:else if !pollData}
      <div class="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-500 space-y-3 shadow-sm">
        <AlertTriangle class="w-10 h-10 text-amber-500 mx-auto" />
        <h3 class="font-bold text-slate-800 text-base">Ingen live-data tillgänglig</h3>
        <p class="text-xs max-w-md mx-auto text-slate-500">
          Valmyndigheten (val.se) kunde inte nås och det finns inga tidigare sparade live-resultat i sessionen.
          Appen försöker automatiskt ansluta igen med exponentiell fördröjning.
        </p>
        <button 
          on:click={handleManualRetry}
          disabled={isLoading}
          class="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-50 inline-flex items-center gap-2"
        >
          <RefreshCw class="w-4 h-4 {isLoading ? 'animate-spin' : ''}" />
          <span>Försök ansluta nu</span>
        </button>
      </div>
    {:else if filteredRegions.length === 0}
      <div class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
        <Search class="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p class="font-medium text-sm">Inga regioner matchar din sökning eller filter.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each filteredRegions as region (region.code)}
          <ElectionCard 
            item={region}
            type="region"
            selectedParties={selectedPartiesPerRegion[region.code] || []}
            onToggleParty={(pCode) => togglePartyInCoalition(region.code, pCode)}
            onClearCoalition={() => clearCoalition(region.code)}
          />
        {/each}
      </div>
    {/if}

    <!-- Footer Information -->
    <footer class="mt-12 text-center text-xs text-slate-400 space-y-1">
      <p>Källa: Officiell rösträkningsdata från <a href="https://val.se" target="_blank" rel="noreferrer" class="underline hover:text-emerald-700">Valmyndigheten (val.se)</a>.</p>
      <p>Data uppdateras automatiskt via regelbunden polling av resultatfiler.</p>
    </footer>
  </div>
</main>
