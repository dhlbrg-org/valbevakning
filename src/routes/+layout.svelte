<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { Building2, Landmark } from 'lucide-svelte';
</script>

<div class="min-h-screen bg-slate-50">
  <nav class="bg-emerald-950 border-b border-emerald-800 text-emerald-100 sticky top-0 z-50">
    <div class="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
      <div class="flex items-center gap-2">
        <span class="bg-emerald-600 text-white px-2 py-1 rounded-lg text-xs font-black tracking-wider uppercase shadow-sm">MP Val</span>
        <span class="font-bold text-sm text-white hidden sm:inline">Miljöpartiet Valbevakning</span>
      </div>

      <div class="flex items-center gap-1 bg-emerald-900/60 p-1 rounded-xl border border-emerald-800/80">
        <a 
          href="/" 
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 {$page.url.pathname === '/' ? 'bg-emerald-600 text-white shadow' : 'text-emerald-200 hover:text-white hover:bg-emerald-800/50'}"
        >
          <Landmark class="w-3.5 h-3.5" />
          <span>Regioner</span>
        </a>
        <a 
          href="/kommuner" 
          class="px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 {$page.url.pathname.startsWith('/kommuner') ? 'bg-emerald-600 text-white shadow' : 'text-emerald-200 hover:text-white hover:bg-emerald-800/50'}"
        >
          <Building2 class="w-3.5 h-3.5" />
          <span>Kommuner</span>
        </a>
      </div>
    </div>
  </nav>

  <slot />
</div>
