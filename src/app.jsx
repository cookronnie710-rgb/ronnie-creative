const { useState, useEffect, useMemo, useCallback, useRef } = React;

    /* ------------------------------------------------------------------ */
    /*  Constants & helpers                                                */
    /* ------------------------------------------------------------------ */

    const LS_KEY = 'fliptracker.v1';

    const SOURCES = ['Car boot', 'Charity shop', 'Facebook Marketplace', 'eBay job lot', 'Other'];
    const CONDITIONS = ['New', 'Used', 'For parts'];
    const CATEGORIES = [
      'PS1', 'PS2', 'Mega Drive', 'Nintendo (NES/SNES)', 'N64',
      'GameCube', 'Game Boy / Handheld', 'Retro Console', 'Accessories',
      'Job Lot', 'General', 'Other',
    ];
    const STATUSES = ['unsold', 'listed', 'sold'];

    const DEFAULT_SETTINGS = {
      fvfRate: 13,      // eBay final value fee %
      fixedFee: 0.3,    // fixed per-order fee £
      minMargin: 30,    // GO / NO GO threshold %
    };

    const gbp = (n) => {
      if (n === null || n === undefined || isNaN(n)) return '£0.00';
      return new Intl.NumberFormat('en-GB', {
        style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(n);
    };
    const pct = (n) => (n === null || n === undefined || isNaN(n) ? '0%' : `${n.toFixed(1)}%`);
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    const todayISO = () => new Date().toISOString().slice(0, 10);
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    const daysBetween = (a, b) => {
      if (!a || !b) return null;
      const d1 = new Date(a); const d2 = new Date(b);
      if (isNaN(d1) || isNaN(d2)) return null;
      return Math.max(0, Math.round((d2 - d1) / 86400000));
    };

    /* Core deal maths — shared by calculator, inventory & dashboard. */
    function computeDeal({ buyPrice, resale, postageCharged, postageCost, packaging, settings }) {
      const s = settings || DEFAULT_SETTINGS;
      const revenue = num(resale) + (postageCharged ? num(postageCost) : 0); // what buyer pays (FVF base)
      const fvf = revenue * (num(s.fvfRate) / 100) + num(s.fixedFee);
      const costs = num(buyPrice) + num(postageCost) + num(packaging);
      const net = revenue - fvf - costs;
      const margin = revenue > 0 ? (net / revenue) * 100 : 0;
      const roi = num(buyPrice) > 0 ? (net / num(buyPrice)) * 100 : 0;
      return { revenue, fvf, costs, net, margin, roi };
    }

    /* Realised net for a SOLD inventory item (fees applied to sale price). */
    function realisedNet(item, settings) {
      const s = settings || DEFAULT_SETTINGS;
      const sale = num(item.salePrice);
      const fvf = sale * (num(s.fvfRate) / 100) + num(s.fixedFee);
      return sale - fvf - num(item.purchasePrice);
    }

    /* ------------------------------------------------------------------ */
    /*  Persistence                                                        */
    /* ------------------------------------------------------------------ */

    function loadState() {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { inventory: [], settings: DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw);
        return {
          inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
          settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
        };
      } catch (e) {
        return { inventory: [], settings: DEFAULT_SETTINGS };
      }
    }

    /* ------------------------------------------------------------------ */
    /*  Small UI primitives                                                */
    /* ------------------------------------------------------------------ */

    const Field = ({ label, children, hint }) => (
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">{label}</span>
        {children}
        {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
      </label>
    );

    const inputCls =
      'w-full rounded-xl bg-panel2 border border-edge px-4 py-3 text-base text-slate-100 ' +
      'placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:border-emerald-500';

    const Input = (props) => <input {...props} className={inputCls} />;
    const Select = ({ children, ...props }) => (
      <select {...props} className={inputCls + ' appearance-none'}>{children}</select>
    );
    const TextArea = (props) => <textarea {...props} className={inputCls + ' min-h-[96px] resize-y'} />;

    const Card = ({ children, className = '' }) => (
      <div className={'rounded-2xl bg-panel border border-edge ' + className}>{children}</div>
    );

    const Stat = ({ label, value, sub, tone = 'default' }) => {
      const toneCls = {
        default: 'text-slate-100',
        good: 'text-emerald-400',
        bad: 'text-rose-400',
        warn: 'text-amber-400',
      }[tone];
      return (
        <Card className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
          <div className={'mt-1 text-2xl sm:text-3xl font-bold tabular-nums ' + toneCls}>{value}</div>
          {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
        </Card>
      );
    };

    /* ------------------------------------------------------------------ */
    /*  1. Deal Calculator                                                 */
    /* ------------------------------------------------------------------ */

    function Calculator({ settings, onSaveToInventory }) {
      const [form, setForm] = useState({
        name: '', condition: 'Used', buyPrice: '', resale: '',
        postageCost: '', packaging: '0.50', postageCharged: true,
      });
      const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

      const d = useMemo(() => computeDeal({
        buyPrice: form.buyPrice, resale: form.resale, postageCharged: form.postageCharged,
        postageCost: form.postageCost, packaging: form.packaging, settings,
      }), [form, settings]);

      const hasInput = num(form.resale) > 0 || num(form.buyPrice) > 0;
      const go = d.margin >= num(settings.minMargin);

      const saveDeal = () => {
        onSaveToInventory({
          id: uid(),
          name: form.name || 'Unnamed item',
          category: 'General',
          condition: form.condition,
          purchasePrice: String(num(form.buyPrice)),
          purchaseDate: todayISO(),
          source: 'Other',
          status: 'unsold',
          listingPrice: String(num(form.resale)),
          salePrice: '',
          saleDate: '',
        });
      };

      return (
        <div className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Field label="Item name">
                  <Input value={form.name} onChange={set('name')} placeholder="e.g. Sonic Mega Collection" />
                </Field>
              </div>
              <Field label="Condition">
                <Select value={form.condition} onChange={set('condition')}>
                  {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Asking / buy price (£)">
                <Input type="number" inputMode="decimal" value={form.buyPrice} onChange={set('buyPrice')} placeholder="0.00" />
              </Field>
              <Field label="Est. resale price (£)">
                <Input type="number" inputMode="decimal" value={form.resale} onChange={set('resale')} placeholder="0.00" />
              </Field>
              <Field label="Postage cost (£)" hint="What it costs you to send it">
                <Input type="number" inputMode="decimal" value={form.postageCost} onChange={set('postageCost')} placeholder="0.00" />
              </Field>
              <Field label="Packaging (£)">
                <Input type="number" inputMode="decimal" value={form.packaging} onChange={set('packaging')} placeholder="0.00" />
              </Field>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, postageCharged: !f.postageCharged }))}
                  className={'w-full rounded-xl px-4 py-3 text-sm font-semibold border transition ' +
                    (form.postageCharged
                      ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                      : 'bg-panel2 border-edge text-slate-400')}
                >
                  {form.postageCharged ? '✓ Buyer pays postage' : 'Free postage (I absorb it)'}
                </button>
              </div>
            </div>
          </Card>

          {/* Verdict */}
          <Card className={'p-5 border-2 ' + (hasInput ? (go ? 'border-emerald-500/70' : 'border-rose-500/70') : 'border-edge')}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Verdict · min margin {pct(num(settings.minMargin))}</div>
                <div className={'text-4xl font-black mt-1 ' + (!hasInput ? 'text-slate-600' : go ? 'text-emerald-400' : 'text-rose-400')}>
                  {!hasInput ? '—' : go ? 'GO' : 'NO GO'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-slate-400">Net profit</div>
                <div className={'text-3xl font-black tabular-nums ' + (d.net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {gbp(d.net)}
                </div>
                <div className="text-sm text-slate-400 tabular-nums">Margin {pct(d.margin)} · ROI {pct(d.roi)}</div>
              </div>
            </div>
          </Card>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Buyer pays (revenue)" value={gbp(d.revenue)} />
            <Stat label={`eBay fees (${settings.fvfRate}% + ${gbp(settings.fixedFee)})`} value={gbp(d.fvf)} tone="warn" />
            <Stat label="Total costs" value={gbp(d.costs)} sub="Buy + postage + packaging" />
            <Stat label="Net profit" value={gbp(d.net)} tone={d.net >= 0 ? 'good' : 'bad'} />
          </div>

          <button
            type="button"
            onClick={saveDeal}
            disabled={!hasInput}
            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-4 text-base font-semibold text-white"
          >
            + Save to inventory as unsold stock
          </button>
        </div>
      );
    }

    /* ------------------------------------------------------------------ */
    /*  2. Inventory Tracker                                               */
    /* ------------------------------------------------------------------ */

    const blankItem = () => ({
      id: uid(), name: '', category: 'PS1', condition: 'Used',
      purchasePrice: '', purchaseDate: todayISO(), source: 'Car boot',
      status: 'unsold', listingPrice: '', salePrice: '', saleDate: '',
    });

    function ItemForm({ initial, settings, onSave, onCancel }) {
      const [item, setItem] = useState(initial);
      const set = (k) => (e) => setItem((it) => ({ ...it, [k]: e.target.value }));
      const isSold = item.status === 'sold';

      const net = isSold ? realisedNet(item, settings) : null;

      return (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Item name">
                <Input value={item.name} onChange={set('name')} placeholder="e.g. Game Boy Colour (Teal)" />
              </Field>
            </div>
            <Field label="Category">
              <Select value={item.category} onChange={set('category')}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Condition">
              <Select value={item.condition} onChange={set('condition')}>
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Purchase price (£)">
              <Input type="number" inputMode="decimal" value={item.purchasePrice} onChange={set('purchasePrice')} placeholder="0.00" />
            </Field>
            <Field label="Purchase date">
              <Input type="date" value={item.purchaseDate} onChange={set('purchaseDate')} />
            </Field>
            <Field label="Source">
              <Select value={item.source} onChange={set('source')}>
                {SOURCES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={item.status} onChange={set('status')}>
                {STATUSES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
              </Select>
            </Field>
            {(item.status === 'listed' || item.status === 'sold') && (
              <Field label="Listing price (£)">
                <Input type="number" inputMode="decimal" value={item.listingPrice} onChange={set('listingPrice')} placeholder="0.00" />
              </Field>
            )}
            {isSold && (
              <>
                <Field label="Sale price (£)">
                  <Input type="number" inputMode="decimal" value={item.salePrice} onChange={set('salePrice')} placeholder="0.00" />
                </Field>
                <Field label="Sale date">
                  <Input type="date" value={item.saleDate} onChange={set('saleDate')} />
                </Field>
              </>
            )}
          </div>

          {isSold && (
            <div className="flex items-center justify-between rounded-xl bg-panel2 border border-edge px-4 py-2 text-sm">
              <span className="text-slate-400">Realised net (after fees)</span>
              <span className={'font-bold tabular-nums ' + (net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{gbp(net)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => onSave(item)}
              disabled={!item.name.trim()}
              className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 py-3 font-semibold text-white"
            >Save</button>
            <button type="button" onClick={onCancel} className="rounded-xl bg-panel2 border border-edge px-5 py-3 font-semibold text-slate-300">Cancel</button>
          </div>
        </Card>
      );
    }

    const statusBadge = (status) => {
      const map = {
        unsold: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
        listed: 'bg-sky-600/20 text-sky-300 border-sky-500/40',
        sold: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40',
      };
      return 'inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ' + map[status];
    };

    function Inventory({ inventory, setInventory, settings }) {
      const [editing, setEditing] = useState(null); // item object or null
      const [filter, setFilter] = useState('all');

      const stats = useMemo(() => {
        const unsold = inventory.filter((i) => i.status !== 'sold');
        const sold = inventory.filter((i) => i.status === 'sold');
        const capital = unsold.reduce((s, i) => s + num(i.purchasePrice), 0);
        const nets = sold.map((i) => realisedNet(i, settings));
        const profit = nets.reduce((s, n) => s + n, 0);
        const margins = sold
          .filter((i) => num(i.salePrice) > 0)
          .map((i) => (realisedNet(i, settings) / num(i.salePrice)) * 100);
        const avgMargin = margins.length ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
        const dts = sold.map((i) => daysBetween(i.purchaseDate, i.saleDate)).filter((d) => d !== null);
        const avgDays = dts.length ? dts.reduce((s, d) => s + d, 0) / dts.length : null;
        return { capital, profit, avgMargin, avgDays, unsoldCount: unsold.length, soldCount: sold.length };
      }, [inventory, settings]);

      const saveItem = (item) => {
        setInventory((inv) => {
          const exists = inv.some((i) => i.id === item.id);
          return exists ? inv.map((i) => (i.id === item.id ? item : i)) : [item, ...inv];
        });
        setEditing(null);
      };
      const remove = (id) => {
        if (window.confirm('Delete this item?')) setInventory((inv) => inv.filter((i) => i.id !== id));
      };

      const shown = useMemo(() => {
        const list = filter === 'all' ? inventory : inventory.filter((i) => i.status === filter);
        return [...list].sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
      }, [inventory, filter]);

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Capital tied up" value={gbp(stats.capital)} sub={`${stats.unsoldCount} unsold`} tone="warn" />
            <Stat label="Profit realised" value={gbp(stats.profit)} sub={`${stats.soldCount} sold`} tone={stats.profit >= 0 ? 'good' : 'bad'} />
            <Stat label="Avg margin" value={pct(stats.avgMargin)} sub="on sold items" />
            <Stat label="Avg days to sell" value={stats.avgDays === null ? '—' : Math.round(stats.avgDays)} sub="purchase → sale" />
          </div>

          {editing ? (
            <ItemForm
              initial={editing}
              settings={settings}
              onSave={saveItem}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(blankItem())}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-4 text-base font-semibold text-white"
            >+ Add item</button>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {['all', ...STATUSES].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={'whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border ' +
                  (filter === f ? 'bg-slate-100 text-slate-900 border-slate-100' : 'bg-panel2 text-slate-300 border-edge')}
              >{f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}</button>
            ))}
          </div>

          <div className="space-y-2">
            {shown.length === 0 && (
              <Card className="p-6 text-center text-slate-500">No items yet. Add stock as you buy it.</Card>
            )}
            {shown.map((i) => {
              const sold = i.status === 'sold';
              const net = sold ? realisedNet(i, settings) : null;
              const days = sold ? daysBetween(i.purchaseDate, i.saleDate) : null;
              return (
                <Card key={i.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={statusBadge(i.status)}>{i.status}</span>
                        <span className="text-xs text-slate-500">{i.category}</span>
                      </div>
                      <div className="mt-1 font-semibold truncate">{i.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {gbp(num(i.purchasePrice))} · {i.source} · {i.purchaseDate}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {sold ? (
                        <>
                          <div className={'text-lg font-bold tabular-nums ' + (net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{gbp(net)}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            sold {gbp(num(i.salePrice))}{days !== null ? ` · ${days}d` : ''}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-slate-400 tabular-nums">
                          {num(i.listingPrice) > 0 ? gbp(num(i.listingPrice)) : '—'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setEditing(i)} className="flex-1 rounded-lg bg-panel2 border border-edge px-3 py-2 text-sm font-medium text-slate-200">Edit</button>
                    <button onClick={() => remove(i.id)} className="rounded-lg bg-panel2 border border-edge px-3 py-2 text-sm font-medium text-rose-400">Delete</button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------------------ */
    /*  3. Listing Generator                                               */
    /* ------------------------------------------------------------------ */

    function buildTitle({ name, brand, platform, condition }) {
      // Keyword-optimised, front-loaded, <= 80 chars.
      const parts = [];
      if (brand) parts.push(brand.trim());
      if (name) parts.push(name.trim());
      if (platform) parts.push(platform.trim());
      if (condition === 'For parts') parts.push('Spares/Repairs');
      else if (condition === 'New') parts.push('New Sealed');
      // Common high-search retro keywords, only added if room remains.
      const tail = ['PAL', 'UK', 'Retro', 'Genuine'];
      let title = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      for (const t of tail) {
        if ((title + ' ' + t).length <= 80 && !title.toLowerCase().includes(t.toLowerCase())) {
          title = title + ' ' + t;
        }
      }
      return title.slice(0, 80).trim();
    }

    function buildDescription({ name, brand, platform, condition, notes, postage, returns }) {
      const title = [brand, name, platform].filter(Boolean).join(' ').trim() || 'Item';
      const condLine = {
        'New': 'Brand new / sealed. Never used.',
        'Used': 'Pre-owned and in good used condition for its age.',
        'For parts': 'Sold as SPARES OR REPAIRS — not fully working / untested. Please read carefully.',
      }[condition];

      return (
`${title}

CONDITION
${condLine}${notes && notes.trim() ? '\n' + notes.trim() : ''}

WHAT YOU GET
Exactly what is shown in the photos — please check them as they form part of the description.

POSTAGE
${postage.trim() || 'Sent within 1 working day of cleared payment. Securely packaged. UK delivery via tracked service.'}

RETURNS
${returns.trim() || (condition === 'For parts'
  ? 'Sold as spares/repairs — no returns accepted. Please ask any questions before buying.'
  : '30-day returns accepted. Item must be returned in the same condition. Buyer pays return postage unless the item is not as described.')}

Any questions, drop me a message before buying — happy to help. Thanks for looking!`
      );
    }

    function Listing() {
      const [f, setF] = useState({
        name: '', brand: '', platform: '', condition: 'Used',
        notes: '', postage: '', returns: '',
      });
      const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
      const [copied, setCopied] = useState('');

      const title = useMemo(() => buildTitle(f), [f]);
      const desc = useMemo(() => buildDescription(f), [f]);

      const copy = (text, which) => {
        const done = () => { setCopied(which); setTimeout(() => setCopied(''), 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(done);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text; document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(ta); done();
        }
      };

      return (
        <div className="space-y-4">
          <Card className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Item / game name">
              <Input value={f.name} onChange={set('name')} placeholder="e.g. Crash Bandicoot" />
            </Field>
            <Field label="Brand / publisher" hint="Optional, boosts search">
              <Input value={f.brand} onChange={set('brand')} placeholder="e.g. Sony, Sega, Nintendo" />
            </Field>
            <Field label="Platform">
              <Input value={f.platform} onChange={set('platform')} placeholder="e.g. PS1, Mega Drive, Game Boy" />
            </Field>
            <Field label="Condition">
              <Select value={f.condition} onChange={set('condition')}>
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Condition notes / details" hint="Scratches, missing manual, tested working, etc.">
                <TextArea value={f.notes} onChange={set('notes')} placeholder="Disc has light scratches but plays fine. Case & manual included. Tested on a PS2." />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Postage info (optional — sensible default used)">
                <Input value={f.postage} onChange={set('postage')} placeholder="Leave blank for a standard postage blurb" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Returns policy (optional — sensible default used)">
                <Input value={f.returns} onChange={set('returns')} placeholder="Leave blank for a standard returns blurb" />
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                eBay title · <span className={title.length > 80 ? 'text-rose-400' : 'text-emerald-400'}>{title.length}/80</span>
              </div>
              <button onClick={() => copy(title, 'title')} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white">
                {copied === 'title' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <div className="rounded-xl bg-panel2 border border-edge px-4 py-3 font-medium break-words">{title || 'Fill in the details above…'}</div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-slate-400">Description</div>
              <button onClick={() => copy(desc, 'desc')} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white">
                {copied === 'desc' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-panel2 border border-edge px-4 py-3 text-sm text-slate-200 font-sans">{desc}</pre>
          </Card>
        </div>
      );
    }

    /* ------------------------------------------------------------------ */
    /*  4. Dashboard                                                       */
    /* ------------------------------------------------------------------ */

    function Dashboard({ inventory, settings, goTab }) {
      const d = useMemo(() => {
        const sold = inventory.filter((i) => i.status === 'sold');
        const now = new Date();
        const ym = now.toISOString().slice(0, 7);
        const monthProfit = sold
          .filter((i) => (i.saleDate || '').slice(0, 7) === ym)
          .reduce((s, i) => s + realisedNet(i, settings), 0);

        const inStock = inventory.filter((i) => i.status !== 'sold');
        const capital = inStock.reduce((s, i) => s + num(i.purchasePrice), 0);

        // Category performance by realised net.
        const byCat = {};
        for (const i of sold) {
          byCat[i.category] = (byCat[i.category] || 0) + realisedNet(i, settings);
        }
        const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const best = cats.length ? cats[0] : null;
        const worst = cats.length ? cats[cats.length - 1] : null;

        const totalProfit = sold.reduce((s, i) => s + realisedNet(i, settings), 0);
        return { monthProfit, inStock: inStock.length, capital, best, worst, totalProfit, soldCount: sold.length };
      }, [inventory, settings]);

      const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`${monthName} profit`} value={gbp(d.monthProfit)} tone={d.monthProfit >= 0 ? 'good' : 'bad'} sub="net, after fees" />
            <Stat label="Items in stock" value={d.inStock} sub={`${gbp(d.capital)} tied up`} tone="warn" />
            <Stat
              label="Best category"
              value={d.best ? d.best[0] : '—'}
              sub={d.best ? gbp(d.best[1]) + ' net' : 'no sales yet'}
              tone={d.best ? 'good' : 'default'}
            />
            <Stat
              label="Worst category"
              value={d.worst && d.worst !== d.best ? d.worst[0] : '—'}
              sub={d.worst && d.worst !== d.best ? gbp(d.worst[1]) + ' net' : 'need more data'}
              tone={d.worst && d.worst !== d.best ? 'bad' : 'default'}
            />
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">All-time realised profit</div>
                <div className={'text-3xl font-black tabular-nums ' + (d.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{gbp(d.totalProfit)}</div>
                <div className="text-xs text-slate-500 mt-0.5">{d.soldCount} items sold</div>
              </div>
              <span className="text-4xl">💷</span>
            </div>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={() => goTab('calc')} className="rounded-2xl bg-panel border border-edge p-5 text-left hover:border-emerald-500/50">
              <div className="text-2xl mb-1">🧮</div>
              <div className="font-semibold">Deal calculator</div>
              <div className="text-xs text-slate-500">Check a buy before you commit</div>
            </button>
            <button onClick={() => goTab('inventory')} className="rounded-2xl bg-panel border border-edge p-5 text-left hover:border-emerald-500/50">
              <div className="text-2xl mb-1">📦</div>
              <div className="font-semibold">Inventory</div>
              <div className="text-xs text-slate-500">Track your stock & sales</div>
            </button>
            <button onClick={() => goTab('listing')} className="rounded-2xl bg-panel border border-edge p-5 text-left hover:border-emerald-500/50">
              <div className="text-2xl mb-1">📝</div>
              <div className="font-semibold">Listing generator</div>
              <div className="text-xs text-slate-500">Title + description in seconds</div>
            </button>
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------------------ */
    /*  Settings                                                           */
    /* ------------------------------------------------------------------ */

    function Settings({ settings, setSettings, inventory, setInventory }) {
      const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: e.target.value }));

      const exportData = () => {
        const blob = new Blob([JSON.stringify({ inventory, settings }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `fliptracker-backup-${todayISO()}.json`; a.click();
        URL.revokeObjectURL(url);
      };
      const importRef = useRef();
      const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            if (Array.isArray(data.inventory)) setInventory(data.inventory);
            if (data.settings) setSettings((s) => ({ ...s, ...data.settings }));
            alert('Backup imported.');
          } catch (err) { alert('Could not read that file.'); }
        };
        reader.readAsText(file);
        e.target.value = '';
      };

      return (
        <div className="space-y-4">
          <Card className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="eBay final value fee (%)" hint="Applied to sale + postage buyer pays">
              <Input type="number" inputMode="decimal" value={settings.fvfRate} onChange={set('fvfRate')} />
            </Field>
            <Field label="Fixed order fee (£)" hint="eBay charges a small per-order fee">
              <Input type="number" inputMode="decimal" value={settings.fixedFee} onChange={set('fixedFee')} />
            </Field>
            <Field label="Min margin for GO (%)" hint="Deals below this show NO GO">
              <Input type="number" inputMode="decimal" value={settings.minMargin} onChange={set('minMargin')} />
            </Field>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold">Data</div>
            <p className="text-xs text-slate-500">Everything is stored on this device in your browser. Back up regularly — clearing browser data will wipe it.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={exportData} className="rounded-xl bg-panel2 border border-edge px-4 py-3 text-sm font-semibold">⬇ Export backup</button>
              <button onClick={() => importRef.current.click()} className="rounded-xl bg-panel2 border border-edge px-4 py-3 text-sm font-semibold">⬆ Import backup</button>
              <input ref={importRef} type="file" accept="application/json" onChange={importData} className="hidden" />
              <button
                onClick={() => { if (window.confirm('Erase ALL inventory and reset settings? This cannot be undone.')) { setInventory([]); setSettings(DEFAULT_SETTINGS); } }}
                className="rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 px-4 py-3 text-sm font-semibold"
              >Reset everything</button>
            </div>
          </Card>

          <div className="text-center text-xs text-slate-600 pt-2">
            FlipTracker · offline-first · GBP · your data never leaves your phone
          </div>
        </div>
      );
    }

    /* ------------------------------------------------------------------ */
    /*  App shell                                                          */
    /* ------------------------------------------------------------------ */

    const TABS = [
      { id: 'dash', label: 'Dashboard', icon: '📊' },
      { id: 'calc', label: 'Calculator', icon: '🧮' },
      { id: 'inventory', label: 'Inventory', icon: '📦' },
      { id: 'listing', label: 'Listing', icon: '📝' },
      { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    function App() {
      const initial = useRef(loadState()).current;
      const [inventory, setInventory] = useState(initial.inventory);
      const [settings, setSettings] = useState(initial.settings);
      const [tab, setTab] = useState('dash');

      // Persist on any change.
      useEffect(() => {
        try { localStorage.setItem(LS_KEY, JSON.stringify({ inventory, settings })); } catch (e) {}
      }, [inventory, settings]);

      const addToInventory = useCallback((item) => {
        setInventory((inv) => [item, ...inv]);
        setTab('inventory');
      }, []);

      return (
        <div className="min-h-full flex flex-col max-w-3xl mx-auto">
          {/* Header */}
          <header className="sticky top-0 z-10 bg-base/90 backdrop-blur border-b border-edge px-4 pt-3 pb-2" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎮</span>
                <h1 className="text-lg font-black tracking-tight">FlipTracker</h1>
              </div>
              <span className="text-[11px] text-slate-500">UK · GBP</span>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 px-4 py-4 pb-28">
            {tab === 'dash' && <Dashboard inventory={inventory} settings={settings} goTab={setTab} />}
            {tab === 'calc' && <Calculator settings={settings} onSaveToInventory={addToInventory} />}
            {tab === 'inventory' && <Inventory inventory={inventory} setInventory={setInventory} settings={settings} />}
            {tab === 'listing' && <Listing />}
            {tab === 'settings' && <Settings settings={settings} setSettings={setSettings} inventory={inventory} setInventory={setInventory} />}
          </main>

          {/* Bottom nav — big tap targets for phone use */}
          <nav
            className="fixed bottom-0 inset-x-0 z-10 bg-panel/95 backdrop-blur border-t border-edge"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="max-w-3xl mx-auto grid grid-cols-5">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={'flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium ' +
                    (tab === t.id ? 'text-emerald-400' : 'text-slate-500')}
                >
                  <span className="text-xl leading-none">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      );
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
