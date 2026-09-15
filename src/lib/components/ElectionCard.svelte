<script lang="ts">
  import type { RegionResult, MunicipalityResult } from '$lib/types';
  import { 
    CheckCircle2, 
    AlertTriangle, 
    Sparkles,
    TrendingUp,
    Target
  } from 'lucide-svelte';

  export let item: RegionResult | MunicipalityResult;
  export let type: 'region' | 'kommun' = 'region';
  export let selectedParties: string[] = [];
  export let onToggleParty: (partyCode: string) => void = () => {};
  export let onClearCoalition: () => void = () => {};

  $: thresholdPct = item.thresholdPct || (type === 'region' ? 3.0 : 2.0);
  $: councilTitle = type === 'region' ? 'Regionfullmäktige' : 'Kommunfullmäktige';

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

  $: coalitionSummary = (() => {
    if (!selectedParties || selectedParties.length === 0) return null;
    const parties = (item.partyMandates || []).filter((p) => selectedParties.includes(p.code));
    const coalitionMandates = parties.reduce((sum, p) => sum + p.mandates, 0);
    const totalMandates = item.totalMandates || (item.partyMandates || []).reduce((sum, p) => sum + p.mandates, 0);
    const majorityThreshold = Math.floor(totalMandates / 2) + 1;
    const isMajority = coalitionMandates >= majorityThreshold;
    const diff = majorityThreshold - coalitionMandates;

    return {
      selectedCodes: selectedParties,
      parties,
      coalitionMandates,
      totalMandates,
      majorityThreshold,
      isMajority,
      diff
    };
  })();
</script>

<div 
  class="bg-white rounded-2xl border p-4 shadow-sm transition hover:shadow-md flex flex-col justify-between {item.hasMandate ? 'border-emerald-200/90 ring-1 ring-emerald-500/10' : 'border-slate-200'}"
>
  <div>
    <!-- Title & Status Badge Header -->
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
          {item.code}
        </span>
        <h3 class="font-bold text-slate-900 text-base truncate">
          {type === 'region' ? (item.name.startsWith('Region') ? item.name : `Region ${item.name}`) : item.name}
        </h3>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        {#if item.isNewRegionWithMandate}
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-600 text-white shadow-sm shrink-0">
            <Sparkles class="w-3.5 h-3.5 text-emerald-200" />
            Ny {type === 'region' ? 'region' : 'kommun'}!
          </span>
        {:else if item.hasMandate}
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/60 shrink-0">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600" />
            Över spärren
          </span>
        {:else}
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
            <AlertTriangle class="w-3.5 h-3.5 text-amber-600" />
            Under spärren (&lt;{thresholdPct}%)
          </span>
        {/if}
      </div>
    </div>

    <!-- Counting Districts Progress Bar (Right Under Header) -->
    {#if item.districtsTotal > 0}
      <div class="mb-3 space-y-1">
        <div class="flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>Räknade distrikt</span>
          <span class="text-slate-700 font-semibold">
            {item.districtsCounted} / {item.districtsTotal}
            <span class="text-slate-400 font-normal">
              ({Math.round((item.districtsCounted / item.districtsTotal) * 100)}%)
            </span>
          </span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div 
            class="h-full rounded-full transition-all duration-500 {item.isCountingComplete ? 'bg-emerald-600' : 'bg-indigo-500'}"
            style="width: {(item.districtsCounted / item.districtsTotal) * 100}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- Balanced 4-Column Stats Grid (Röster | Röstandel | Mandat | Spärr %) -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3 text-center">
      <div>
        <span class="block text-[11px] text-slate-500 font-medium">MP Röster</span>
        <span class="text-sm font-black text-slate-900 block">
          {formatNumber(item.mpVotesCount)}
        </span>
        {#if item.mpVotesCountChange !== undefined && item.mpVotesCountChange !== 0}
          <span class="block text-[10px] font-extrabold {item.mpVotesCountChange > 0 ? 'text-emerald-600' : 'text-rose-600'}">
            {formatChangeNum(item.mpVotesCountChange)}
          </span>
        {/if}
      </div>
      <div>
        <span class="block text-[11px] text-slate-500 font-medium">Röstandel</span>
        <span class="text-sm font-black block {item.hasMandate ? 'text-emerald-700' : 'text-amber-600'}">
          {item.mpVotesPct.toFixed(1)}%
        </span>
        {#if item.mpVotesPctChange !== undefined && item.mpVotesPctChange !== 0}
          <span class="block text-[10px] font-extrabold {item.mpVotesPctChange > 0 ? 'text-emerald-600' : 'text-rose-600'}">
            {formatChangePct(item.mpVotesPctChange)}
          </span>
        {/if}
      </div>
      <div>
        <span class="block text-[11px] text-slate-500 font-medium">Mandat</span>
        <span class="text-sm font-black block {item.hasMandate ? 'text-emerald-700' : 'text-slate-400'}">
          {item.mpMandates}
        </span>
        {#if item.mpMandatesChange !== undefined && item.mpMandatesChange !== 0}
          <span class="block text-[10px] font-extrabold {item.mpMandatesChange > 0 ? 'text-emerald-600' : 'text-rose-600'}">
            {formatChangeNum(item.mpMandatesChange)}
          </span>
        {/if}
      </div>
      <div>
        <span class="block text-[11px] text-slate-500 font-medium">Spärr ({thresholdPct}%)</span>
        <span class="text-sm font-bold text-slate-700 block">
          {formatNumber(item.thresholdVotesCount)}
        </span>
        <span class="block text-[10px] font-semibold text-slate-400">röster</span>
      </div>
    </div>

    <!-- Mandate Proximity Callout Box (Gaining / Losing Mandates) -->
    <div class="mb-3 p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 text-xs">
      <!-- Till nästa mandat (+1) -->
      <div class="flex items-center justify-between text-slate-800">
        <span class="flex items-center gap-1.5 font-medium">
          <TrendingUp class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Till nästa mandat (+1):</span>
        </span>
        <span class="font-extrabold text-emerald-900 bg-emerald-100/90 px-2 py-0.5 rounded-md border border-emerald-300/60">
          Saknar {formatNumber(item.votesToNextMandate)} röster
        </span>
      </div>

      <!-- Till godo för sista mandatet -->
      {#if item.hasMandate}
        <div class="flex items-center justify-between text-slate-800 pt-1.5 border-t border-slate-200/80">
          <span class="flex items-center gap-1.5 font-medium">
            <AlertTriangle class="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Sista mandat (till godo):</span>
          </span>
          <span class="font-extrabold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300/60">
            +{formatNumber(item.votesToLoseMandate)} röster till godo
          </span>
        </div>
      {/if}
    </div>

    <!-- Röstandel Bar vs Threshold Line -->
    <div class="space-y-1 mb-1">
      <div class="flex items-center justify-between text-[11px] text-slate-500 font-medium">
        <span>Röstandel (vs {thresholdPct}%-spärr)</span>
        <span class="{item.mpVotesPct >= thresholdPct ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}">
          {item.mpVotesPct.toFixed(1)}% {item.mpVotesPct >= thresholdPct ? '✓' : ''}
        </span>
      </div>
      <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden relative">
        <!-- Marker line for threshold -->
        <div 
          class="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10" 
          style="left: {thresholdPct * 10}%"
          title="{thresholdPct}% spärr"
        ></div>
        <!-- Progress bar up to 10% max scale -->
        <div 
          class="h-full rounded-full transition-all duration-500 {item.mpVotesPct >= thresholdPct ? 'bg-emerald-500' : 'bg-amber-400'}"
          style="width: {Math.min(100, (item.mpVotesPct / 10) * 100)}%"
        ></div>
      </div>
    </div>
  </div>

  <!-- Bottom Section: Mandatfördelning & Interactive Majority Builder -->
  {#if item.partyMandates && item.partyMandates.length > 0}
    <div class="pt-3 border-t border-slate-100 space-y-2 mt-2">
      <div class="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
        <span>Mandatfördelning i {councilTitle}</span>
        <span class="text-[10px] text-slate-400 font-normal">
          Totalt {item.totalMandates || item.partyMandates.reduce((s, p) => s + p.mandates, 0)} mandat
        </span>
      </div>

      <!-- Interactive Party Chips Grid -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#each item.partyMandates as p (p.code)}
          {@const isSelected = selectedParties.includes(p.code)}
          <button 
            type="button"
            on:click={() => onToggleParty(p.code)}
            class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer select-none active:scale-95 {isSelected ? 'bg-indigo-600 text-white font-bold border-indigo-700 shadow-sm ring-2 ring-indigo-500/20' : p.code === 'MP' ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold hover:bg-emerald-100' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}"
            title="Klicka för att lägga till eller ta bort {p.name || p.code} i koalitionsberäkningen"
          >
            <span class={isSelected ? 'text-white' : p.code === 'MP' ? 'text-emerald-800 font-black' : 'text-slate-900 font-bold'}>{p.code}</span>
            <span class="font-mono font-bold">{p.mandates}</span>
            {#if p.mandatesChange !== undefined && p.mandatesChange !== 0}
              <span class="text-[10px] font-extrabold {isSelected ? 'text-indigo-200' : p.mandatesChange > 0 ? 'text-emerald-600' : 'text-rose-600'}">
                ({formatChangeNum(p.mandatesChange)})
              </span>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Dynamic Coalition / Majority Banner -->
      {#if coalitionSummary}
        <div class="mt-2 p-2.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs {coalitionSummary.isMajority ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-indigo-50/90 border-indigo-200 text-indigo-950'}">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md {coalitionSummary.isMajority ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}">
              {coalitionSummary.isMajority ? 'Majoritet ✓' : 'Koalition'}
            </span>
            <span class="font-extrabold text-slate-900">
              {coalitionSummary.selectedCodes.join(' + ')}
            </span>
            <span class="text-slate-500 text-[11px]">
              ({coalitionSummary.coalitionMandates} av {coalitionSummary.totalMandates} mandat)
            </span>
          </div>

          <div class="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
            {#if coalitionSummary.isMajority}
              <span class="font-extrabold text-emerald-800 flex items-center gap-1">
                <CheckCircle2 class="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Majoritet! (krävs {coalitionSummary.majorityThreshold})</span>
              </span>
            {:else}
              <span class="font-bold text-indigo-900 flex items-center gap-1">
                <Target class="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Minoritet (saknar {coalitionSummary.diff} mandat till {coalitionSummary.majorityThreshold})</span>
              </span>
            {/if}

            <button 
              type="button"
              on:click={onClearCoalition}
              class="text-[11px] text-slate-400 hover:text-slate-700 underline font-medium px-1 shrink-0"
            >
              Rensa
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
