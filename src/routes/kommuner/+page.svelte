<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { MunicipalityPollResponse, MunicipalityResult } from '$lib/types';
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
    Building2,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
  } from 'lucide-svelte';

  let pollData: MunicipalityPollResponse | null = null;
  let isLoading = false;
  let errorMsg = '';
  let consecutiveErrors = 0;
  let retryBackoffSeconds = 0;
  
  // Controls
  let pollPhase: 'preliminary' | 'final' = 'preliminary';
  let pollIntervalSeconds = 300;
  let countdown = pollIntervalSeconds;
  let countdownTimer: any = null;

  // Search, Filters & Sorting
  let searchQuery = '';
  let activeTab: 'all' | 'secured' | 'below_threshold' | 'new_regions' | 'without_mandate_prev' = 'all';
  let selectedRegionFilter = 'all';

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
      const res = await fetch(`/api/poll/kommuner?phase=${pollPhase}`);
      const data: MunicipalityPollResponse = await res.json().catch(() => null);

      if (!res.ok || !data) {
        const detail = data?.errorDetails || `HTTP ${res?.status || 504}: Timeout vid anrop till val.se`;
        throw new Error(detail);
      }

      errorMsg = '';
      consecutiveErrors = 0;
      retryBackoffSeconds = 0;
      pollData = data;

      countdown = pollIntervalSeconds;
    } catch (err: any) {
      consecutiveErrors++;
      errorMsg = err?.message || 'Timeout vid anrop till val.se';
      retryBackoffSeconds = Math.min(60, Math.pow(2, consecutiveErrors));
      countdown = retryBackoffSeconds;
    } finally {
      isLoading = false;
    }
  }

  function startPolling() {
    stopPolling();
    fetchPollData();

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

  onMount(() => {
    loadCoalitionsFromStorage();
    startPolling();
  });

  onDestroy(() => {
    stopPolling();
  });

  // Dynamic active summary calculation depending on selected region filter
  $: activeSummary = (() => {
    if (!pollData?.summary) return null;
    if (selectedRegionFilter === 'all') return pollData.summary;

    const mList = (pollData?.municipalities || []).filter((m) => m.code.startsWith(selectedRegionFilter));
    const totalMpMandates = mList.reduce((sum, r) => sum + r.mpMandates, 0);
    const totalMpMandatesChange = mList.reduce((sum, r) => sum + r.mpMandatesChange, 0);
    const totalMpVotes = mList.reduce((sum, r) => sum + r.mpVotesCount, 0);
    const totalMpVotesChange = mList.reduce((sum, r) => sum + r.mpVotesCountChange, 0);

    const regionsWithMandatesCount = mList.filter((r) => r.hasMandate).length;
    const newlyGainedRegionsCount = mList.filter((r) => r.isNewRegionWithMandate).length;
    const regionsBelowThresholdCount = mList.filter((r) => r.mpVotesPct < (r.thresholdPct || 2.0)).length;
    const totalVotesNeededBelowThreshold = mList
      .filter((r) => r.mpVotesPct < (r.thresholdPct || 2.0))
      .reduce((sum, r) => sum + Math.max(0, r.votesToNextMandate), 0);

    const validPctCount = mList.filter((r) => r.mpVotesPct > 0).length;
    const averageMpVotePct =
      validPctCount > 0
        ? Number((mList.reduce((sum, r) => sum + r.mpVotesPct, 0) / validPctCount).toFixed(2))
        : 0;

    const averageMpVotePctChange =
      validPctCount > 0
        ? Number((mList.reduce((sum, r) => sum + r.mpVotesPctChange, 0) / validPctCount).toFixed(2))
        : 0;

    return {
      totalMpMandates,
      totalMpMandatesChange,
      totalMpVotes,
      totalMpVotesChange,
      regionsWithMandatesCount,
      newlyGainedRegionsCount,
      regionsBelowThresholdCount,
      totalVotesNeededBelowThreshold,
      totalRegions: mList.length,
      totalDistrictsCounted: mList.reduce((sum, r) => sum + r.districtsCounted, 0),
      totalDistrictsTotal: mList.reduce((sum, r) => sum + r.districtsTotal, 0),
      averageMpVotePct,
      averageMpVotePctChange
    };
  })();

  // Filtered & sorted municipalities calculation
  $: filteredMunicipalities = (pollData?.municipalities || [])
    .filter((r) => {
      if (selectedRegionFilter !== 'all' && !r.code.startsWith(selectedRegionFilter)) {
        return false;
      }
      const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.code.includes(searchQuery);
      if (!matchesSearch) return false;

      const thresh = r.thresholdPct || 2.0;
      if (activeTab === 'secured') return r.hasMandate;
      if (activeTab === 'below_threshold') return r.mpVotesPct < thresh;
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

  $: regionFilteredList = selectedRegionFilter === 'all'
    ? (pollData?.municipalities || [])
    : (pollData?.municipalities || []).filter((m) => m.code.startsWith(selectedRegionFilter));

  $: securedCount = regionFilteredList.filter((r) => r.hasMandate).length;
  $: belowThresholdCount = regionFilteredList.filter((r) => r.mpVotesPct < (r.thresholdPct || 2.0)).length;
  $: newMunicipalitiesCount = regionFilteredList.filter((r) => r.isNewRegionWithMandate).length;
  $: withoutMandatePrevCount = regionFilteredList.filter((r) => (r.mpMandates - r.mpMandatesChange) <= 0).length;

  function formatTime(isoString: string) {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  const LOCAL_STORAGE_KEY = 'mp_val_kommun_coalition_builder_v1';
  let selectedPartiesPerMunicipality: Record<string, string[]> = {};

  function loadCoalitionsFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        selectedPartiesPerMunicipality = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load municipal coalition selections from localStorage:', e);
    }
  }

  function saveCoalitionsToStorage(state: Record<string, string[]>) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save municipal coalition selections to localStorage:', e);
    }
  }

  function togglePartyInCoalition(mCode: string, partyCode: string) {
    const current = selectedPartiesPerMunicipality[mCode] || [];
    const updated = current.includes(partyCode)
      ? current.filter((c) => c !== partyCode)
      : [...current, partyCode];

    selectedPartiesPerMunicipality = {
      ...selectedPartiesPerMunicipality,
      [mCode]: updated
    };
    saveCoalitionsToStorage(selectedPartiesPerMunicipality);
  }

  function clearCoalition(mCode: string) {
    const next = { ...selectedPartiesPerMunicipality };
    delete next[mCode];
    selectedPartiesPerMunicipality = next;
    saveCoalitionsToStorage(selectedPartiesPerMunicipality);
  }

  function getCoalitionSummary(m: MunicipalityResult, state: Record<string, string[]>) {
    const selectedCodes = state[m.code] || [];
    if (selectedCodes.length === 0) return null;

    const selectedParties = (m.partyMandates || []).filter((p) => selectedCodes.includes(p.code));
    const coalitionMandates = selectedParties.reduce((sum, p) => sum + p.mandates, 0);
    const totalMandates = m.totalMandates || (m.partyMandates || []).reduce((sum, p) => sum + p.mandates, 0);
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
  <title>MP Kommunmandat | Sveriges 290 Kommuner</title>
</svelte:head>

<main class="min-h-screen bg-slate-50 text-slate-900 pb-12">
  <!-- Header Banner -->
  <header class="bg-emerald-950 text-white shadow-md border-b border-emerald-800">
    <div class="max-w-4xl mx-auto px-4 py-6">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600/90 text-white tracking-wide uppercase flex items-center gap-1">
              <Building2 class="w-3 h-3" />
              Kommunfullmäktige
            </span>
            <span class="text-xs text-emerald-300 font-mono flex items-center gap-1">
              <Globe class="w-3 h-3" />
              Live val.se ({pollData?.electionYear || '2026'})
            </span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
            Miljöpartiet i Sveriges Kommuner
          </h1>
          <p class="text-xs sm:text-sm text-emerald-200 mt-1 max-w-xl">
            Live-bevakning av alla 290 kommuner: mandat, röstandel, spärrnärhet (2%/3%) samt majoritetsbyggare för kommunfullmäktige.
          </p>
        </div>

        <!-- Controls: Preliminary vs Final & Polling Status -->
        <div class="flex flex-col items-start sm:items-end gap-2 shrink-0">
          <div class="flex items-center gap-2">
            <button 
              on:click={fetchPollData}
              disabled={isLoading}
              class="p-2 rounded-xl bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 border border-emerald-700/60 transition disabled:opacity-50"
              title="Uppdatera nu"
            >
              <RefreshCw class="w-4 h-4 {isLoading ? 'animate-spin text-emerald-400' : ''}" />
            </button>

            <div class="bg-emerald-900/80 border border-emerald-700/60 p-1 rounded-xl flex items-center gap-1 text-xs">
              <button 
                on:click={() => handlePhaseChange('preliminary')}
                class="px-3 py-1 rounded-md text-xs font-bold transition {pollPhase === 'preliminary' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-300 hover:text-white'}"
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
    </div>
  </header>

  <div class="max-w-4xl mx-auto px-4 mt-6 space-y-6">

    <!-- Error Banner -->
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

          <div class="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button 
              on:click={handleManualRetry}
              disabled={isLoading}
              class="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              Försök igen nu
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Key Metrics Overview Cards (Mobile Grid & Region Selector) -->
    {#if activeSummary}
      <SummaryMetricsBar 
        summary={activeSummary} 
        type="kommun" 
        regionFilter={selectedRegionFilter} 
        onRegionFilterChange={(rCode) => selectedRegionFilter = rCode} 
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
            placeholder="Sök kommun (t.ex. Stockholm, Malmö, Uppsala)..."
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
          Alla ({pollData?.municipalities?.length || 0})
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
          Nya kommuner ({newMunicipalitiesCount})
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

    <!-- Municipalities Grid (Mobile-First Cards) -->
    {#if isLoading && !pollData}
      <div class="py-12 text-center text-slate-400 space-y-3">
        <RefreshCw class="w-8 h-8 animate-spin mx-auto text-emerald-600" />
        <p class="text-sm">Hämtar kommunresultat från val.se...</p>
      </div>
    {:else if !pollData}
      <div class="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-500 space-y-3 shadow-sm">
        <AlertTriangle class="w-10 h-10 text-amber-500 mx-auto" />
        <h3 class="font-bold text-slate-800 text-base">Ingen live-data tillgänglig</h3>
        <p class="text-xs max-w-md mx-auto text-slate-500">
          Valmyndigheten (val.se) kunde inte nås just nu. Appen försöker automatiskt ansluta igen.
        </p>
      </div>
    {:else if filteredMunicipalities.length === 0}
      <div class="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500 text-sm">
        Inga kommuner matchade sökningen eller filtret.
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each filteredMunicipalities as m (m.code)}
          <ElectionCard 
            item={m}
            type="kommun"
            selectedParties={selectedPartiesPerMunicipality[m.code] || []}
            onToggleParty={(pCode) => togglePartyInCoalition(m.code, pCode)}
            onClearCoalition={() => clearCoalition(m.code)}
          />
        {/each}
      </div>
    {/if}
  </div>
</main>
