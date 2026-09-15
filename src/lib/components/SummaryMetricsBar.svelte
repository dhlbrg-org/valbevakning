<script lang="ts">
  import type { PollSummary } from '$lib/types';
  import { 
    Award, 
    Vote, 
    TrendingUp, 
    CheckCircle2, 
    Target, 
    Sparkles,
    Filter
  } from 'lucide-svelte';

  export let summary: PollSummary;
  export let type: 'region' | 'kommun' = 'region';
  export let regionFilter: string = 'all';
  export let onRegionFilterChange: ((regionCode: string) => void) | undefined = undefined;

  export const REGION_CODES: { code: string; name: string }[] = [
    { code: '01', name: 'Stockholms län' },
    { code: '03', name: 'Uppsala län' },
    { code: '04', name: 'Södermanlands län' },
    { code: '05', name: 'Östergötlands län' },
    { code: '06', name: 'Jönköpings län' },
    { code: '07', name: 'Kronobergs län' },
    { code: '08', name: 'Kalmar län' },
    { code: '10', name: 'Blekinge län' },
    { code: '12', name: 'Skåne län' },
    { code: '13', name: 'Hallands län' },
    { code: '14', name: 'Västra Götalands län' },
    { code: '17', name: 'Värmlands län' },
    { code: '18', name: 'Örebro län' },
    { code: '19', name: 'Västmanlands län' },
    { code: '20', name: 'Dalarnas län' },
    { code: '21', name: 'Gävleborgs län' },
    { code: '22', name: 'Västernorrlands län' },
    { code: '23', name: 'Jämtlands län' },
    { code: '24', name: 'Västerbottens län' },
    { code: '25', name: 'Norrbottens län' }
  ];

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
</script>

<div class="space-y-2">
  {#if type === 'kommun' && onRegionFilterChange}
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
      <div class="flex items-center gap-2 text-xs text-slate-600">
        <Filter class="w-4 h-4 text-emerald-600 shrink-0" />
        <span class="font-bold text-slate-800">Filtrera sammanställning & kommuner per län:</span>
      </div>

      <select 
        value={regionFilter}
        on:change={(e) => onRegionFilterChange && onRegionFilterChange(e.currentTarget.value)}
        class="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
      >
        <option value="all">Alla 21 län (samtliga 290 kommuner)</option>
        {#each REGION_CODES as reg}
          <option value={reg.code}>{reg.name} ({reg.code})</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- 5-Card Metrics Overview Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
    <!-- Mandat Totalt -->
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
      <div class="flex items-center justify-between text-slate-500 mb-1">
        <span class="text-xs font-medium">Totalt MP Mandat</span>
        <Award class="w-4 h-4 text-emerald-600" />
      </div>
      <div class="flex items-baseline gap-2 flex-wrap">
        <span class="text-2xl sm:text-3xl font-black text-emerald-800">
          {summary.totalMpMandates}
        </span>
        {#if summary.totalMpMandatesChange !== undefined && summary.totalMpMandatesChange !== 0}
          <span class="text-xs font-extrabold px-1.5 py-0.5 rounded {summary.totalMpMandatesChange > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
            {formatChangeNum(summary.totalMpMandatesChange)}
          </span>
        {/if}
      </div>
      <span class="text-[11px] text-slate-500 mt-1">
        i {type === 'region' ? 'regionfullmäktige' : 'kommunfullmäktige'}
      </span>
    </div>

    <!-- Totalt MP Röster -->
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
      <div class="flex items-center justify-between text-slate-500 mb-1">
        <span class="text-xs font-medium">Totalt MP Röster</span>
        <Vote class="w-4 h-4 text-emerald-600" />
      </div>
      <div class="flex items-baseline gap-1.5 flex-wrap">
        <span class="text-xl sm:text-2xl font-black text-slate-900">
          {formatNumber(summary.totalMpVotes)}
        </span>
        {#if summary.totalMpVotesChange !== undefined && summary.totalMpVotesChange !== 0}
          <span class="text-[11px] font-extrabold px-1.5 py-0.5 rounded {summary.totalMpVotesChange > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
            {formatChangeNum(summary.totalMpVotesChange)}
          </span>
        {/if}
      </div>
      <span class="text-[11px] text-slate-500 mt-1">
        röster i {type === 'region' ? 'regionvalen' : 'kommunvalen'}
      </span>
    </div>

    <!-- Genomsnittlig Röstandel -->
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
      <div class="flex items-center justify-between text-slate-500 mb-1">
        <span class="text-xs font-medium">Snitt Röstandel</span>
        <TrendingUp class="w-4 h-4 text-emerald-600" />
      </div>
      <div class="flex items-baseline gap-1.5 flex-wrap">
        <span class="text-2xl sm:text-3xl font-black text-slate-900">
          {summary.averageMpVotePct}%
        </span>
        {#if summary.averageMpVotePctChange !== undefined && summary.averageMpVotePctChange !== 0}
          <span class="text-xs font-extrabold px-1.5 py-0.5 rounded {summary.averageMpVotePctChange > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">
            {formatChangePct(summary.averageMpVotePctChange)}
          </span>
        {/if}
      </div>
      <span class="text-[11px] text-slate-500 mt-1">
        genomsnitt per {type === 'region' ? 'region' : 'kommun'}
      </span>
    </div>

    <!-- Regioner / Kommuner med mandat -->
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
      <div class="flex items-center justify-between text-slate-500 mb-1">
        <span class="text-xs font-medium">Mandat i {type === 'region' ? 'Regioner' : 'Kommuner'}</span>
        <CheckCircle2 class="w-4 h-4 text-emerald-600" />
      </div>
      <div class="flex items-baseline gap-1.5 flex-wrap">
        <span class="text-2xl sm:text-3xl font-black text-slate-900">
          {summary.regionsWithMandatesCount} <span class="text-base font-normal text-slate-500">/ {summary.totalRegions}</span>
        </span>
      </div>
      <span class="text-[11px] text-slate-500 mt-1">
        {#if summary.newlyGainedRegionsCount > 0}
          <span class="text-emerald-700 font-bold inline-flex items-center gap-1">
            <Sparkles class="w-3 h-3 text-emerald-600 shrink-0" />
            +{summary.newlyGainedRegionsCount} {summary.newlyGainedRegionsCount === 1 ? (type === 'region' ? 'ny region' : 'ny kommun') : (type === 'region' ? 'nya regioner' : 'nya kommuner')}
          </span>
        {:else}
          {type === 'region' ? 'regioner' : 'kommuner'} över spärren
        {/if}
      </span>
    </div>

    <!-- Status Spärren -->
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between col-span-2 sm:col-span-1">
      <div class="flex items-center justify-between text-slate-500 mb-1">
        <span class="text-xs font-medium">Under Spärren</span>
        <Target class="w-4 h-4 {summary.regionsBelowThresholdCount > 0 ? 'text-amber-600' : 'text-emerald-600'}" />
      </div>
      <div class="text-2xl sm:text-3xl font-black {summary.regionsBelowThresholdCount > 0 ? 'text-amber-700' : 'text-emerald-700'}">
        {summary.regionsBelowThresholdCount} <span class="text-xs font-semibold text-slate-500">{type === 'region' ? 'regioner' : 'kommuner'}</span>
      </div>
      <span class="text-[11px] text-slate-500 mt-1">
        {#if summary.regionsBelowThresholdCount > 0}
          Totalt saknas <strong class="text-amber-700">{formatNumber(summary.totalVotesNeededBelowThreshold)}</strong> röster
        {:else}
          Alla {type === 'region' ? 'regioner' : 'kommuner'} klarar spärren! 🎉
        {/if}
      </span>
    </div>
  </div>
</div>
