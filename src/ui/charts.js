/* Keel — charts. Hand-rolled SVG, no chart library.
 *
 * Colour follows the data's job, not decoration:
 *   net over time  -> diverging (blue positive / red negative, gray zero line)
 *   habit heatmap  -> sequential, one hue, light steps recede to the surface
 *   single series  -> one accent line, no legend (the title names it)
 * Every mark carries a direct label or an accessible summary, so nothing
 * depends on colour alone.
 */
(function (K) {
  'use strict';

  const h = K.Dom.h, U = K.Util;

  function svgRoot(w, hgt, opts) {
    const o = opts || {};
    return h('svg.chart', {
      viewBox: '0 0 ' + w + ' ' + hgt,
      preserveAspectRatio: o.preserve || 'none',
      role: 'img',
      'aria-label': o.label || '',
      focusable: 'false',
      style: { height: (o.cssHeight || hgt) + 'px' }
    });
  }

  /* ----------------------------------------------------------- sparkline */

  function sparkline(points, opts) {
    const o = opts || {};
    const w = 300, hh = o.height || 56, pad = 4;
    if (!points || points.length < 2) {
      return h('div.chart-empty', o.emptyText || 'Not enough data yet');
    }

    const values = points.map(function (p) { return p.value; });
    let min = Math.min.apply(null, values);
    let max = Math.max.apply(null, values);
    if (o.min !== undefined) min = Math.min(min, o.min);
    if (o.max !== undefined) max = Math.max(max, o.max);
    if (max === min) { max = min + 1; min = min - 1; }

    const x = function (i) { return pad + (i / (points.length - 1)) * (w - pad * 2); };
    const y = function (v) { return hh - pad - ((v - min) / (max - min)) * (hh - pad * 2); };

    const d = points.map(function (p, i) {
      return (i ? 'L' : 'M') + U.round(x(i), 2) + ' ' + U.round(y(p.value), 2);
    }).join(' ');

    const area = d + ' L' + U.round(x(points.length - 1), 2) + ' ' + (hh - pad) +
      ' L' + pad + ' ' + (hh - pad) + ' Z';

    const last = points[points.length - 1];
    const gradId = 'spark' + Math.random().toString(36).slice(2, 8);

    const root = svgRoot(w, hh, {
      cssHeight: hh,
      label: (o.label || 'Trend') + ': ' + points.length + ' points, ' +
        'from ' + U.round(points[0].value, 1) + ' to ' + U.round(last.value, 1)
    });

    root.appendChild(h('defs', h('linearGradient', {
      id: gradId, x1: '0', y1: '0', x2: '0', y2: '1'
    }, [
      h('stop', { offset: '0%', 'stop-color': 'var(--series-1)', 'stop-opacity': '0.28' }),
      h('stop', { offset: '100%', 'stop-color': 'var(--series-1)', 'stop-opacity': '0' })
    ])));
    root.appendChild(h('path', { d: area, fill: 'url(#' + gradId + ')', stroke: 'none' }));
    root.appendChild(h('path', {
      d: d, fill: 'none', stroke: 'var(--series-1)', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke'
    }));
    // Only the latest point is marked — a dot on every point is noise.
    root.appendChild(h('circle', {
      cx: U.round(x(points.length - 1), 2), cy: U.round(y(last.value), 2), r: 3.5,
      fill: 'var(--series-1)', stroke: 'var(--surface)', 'stroke-width': 2
    }));

    return h('div.spark-wrap', [
      root,
      // Labelled, because an unlabelled number sitting between the low and
      // the high reads as a midpoint rather than as the latest reading.
      h('div.spark-meta', [
        h('span', 'low ' + U.round(min, 1) + o.unit),
        h('span.spark-latest', 'now ' + U.round(last.value, 1) + o.unit),
        h('span', 'high ' + U.round(max, 1) + o.unit)
      ])
    ]);
  }

  /* ---------------------------------------------------- net bars (diverging) */

  // Positive and negative months around a shared zero line. Two poles that
  // read as opposite, gray at the midpoint — never a rainbow.
  function netBars(months, opts) {
    const o = opts || {};
    // A month with nothing logged is unknown, not break-even. Drawing it as a
    // zero would quietly invent a balanced month that never happened.
    const known = months.filter(function (m) { return m.count > 0; });
    const values = known.map(function (m) { return m.netPence; });
    const maxAbs = Math.max.apply(null, values.map(Math.abs).concat([1]));

    // One number format for the whole row, chosen from the largest value —
    // mixing £701.70 and £1.3k in one line reads as two different charts.
    const fmt = maxAbs >= 100000 ? { compact: true, plus: true } : { round: true, plus: true };

    const anyPos = known.some(function (m) { return m.netPence > 0; });
    const anyNeg = known.some(function (m) { return m.netPence < 0; });

    return h('div.netbars' + (anyPos ? '' : '.no-pos') + (anyNeg ? '' : '.no-neg'), [
      h('div.netbars-track', months.map(function (m) {
        if (!m.count) {
          return h('div.netbar.is-unknown', [
            h('div.netbar-top'),
            h('div.netbar-zero'),
            h('div.netbar-bottom'),
            h('div.netbar-label', '—'),
            h('div.netbar-month', monthShort(m.monthKey))
          ]);
        }
        const v = m.netPence;
        const frac = Math.abs(v) / maxAbs;
        const positive = v >= 0;
        return h('div.netbar', {
          title: m.monthKey + ': ' + U.formatMoney(v, { plus: true })
        }, [
          h('div.netbar-top', positive
            ? h('div.netbar-fill.is-pos', {
                style: { height: Math.max(2, frac * 100) + '%' }
              })
            : null),
          h('div.netbar-zero'),
          h('div.netbar-bottom', !positive
            ? h('div.netbar-fill.is-neg', {
                style: { height: Math.max(2, frac * 100) + '%' }
              })
            : null),
          h('div.netbar-label' + (positive ? '.is-pos' : '.is-neg'),
            U.formatMoney(v, fmt)),
          h('div.netbar-month', monthShort(m.monthKey))
        ]);
      })),
      h('p.sr-only', 'Monthly net: ' + months.map(function (m) {
        return monthShort(m.monthKey) + ' ' +
          (m.count ? U.formatMoney(m.netPence, { plus: true }) : 'not logged');
      }).join(', '))
    ]);
  }

  function monthShort(key) {
    const n = Number(String(key).slice(5, 7));
    return U.MONTH_NAMES[U.clamp(n - 1, 0, 11)].slice(0, 3);
  }

  /* ------------------------------------------------- ranked bars (magnitude) */

  // One measure across categories. Magnitude is the whole message, so every
  // bar shares one hue and carries its own value label — colour here would
  // encode rank, which is exactly what colour must not do.
  function rankedBars(items, opts) {
    const o = opts || {};
    if (!items.length) return h('div.chart-empty', o.emptyText || 'Nothing to show');
    const max = Math.max.apply(null, items.map(function (i) { return i.value; }).concat([1]));
    return h('div.ranked', items.map(function (i) {
      return h('div.ranked-row', [
        h('div.ranked-label', i.label),
        h('div.ranked-track', h('div.ranked-fill', {
          style: { width: Math.max(2, (i.value / max) * 100) + '%' }
        })),
        h('div.ranked-value', i.display)
      ]);
    }));
  }

  /* ------------------------------------------------- heatmap (sequential) */

  // One hue, light to dark: an untouched day recedes toward the surface,
  // a completed one sits at full strength. Never two hues.
  function heatmap(grid, opts) {
    const o = opts || {};
    const maxCount = Math.max(1, o.maxCount || 1);

    return h('div.heatmap', [
      h('div.heatmap-days', U.DAY_NAMES.map(function (d, i) {
        return h('div.heatmap-daylabel', i % 2 === 0 ? d[0] : '');
      })),
      h('div.heatmap-grid', grid.map(function (week) {
        return h('div.heatmap-week', week.days.map(function (day) {
          const level = day.future ? -1
            : (day.count > 0 ? Math.ceil((day.count / maxCount) * 3) : 0);
          return h('div.heatmap-cell' +
            (day.future ? '.is-future' : '.level-' + U.clamp(level, 0, 3)), {
            title: U.formatDate(day.date, 'medium') +
              (day.future ? '' : ' — ' + (day.count ? day.count + ' done' : 'none'))
          });
        }));
      })),
      o.legend === false ? null : h('div.heatmap-legend', [
        h('span', 'Less'),
        h('div.heatmap-cell.level-0'),
        h('div.heatmap-cell.level-1'),
        h('div.heatmap-cell.level-2'),
        h('div.heatmap-cell.level-3'),
        h('span', 'More')
      ])
    ]);
  }

  /* ------------------------------------------------------------ score bars */

  // Domain scores. Five slots at most, taken in fixed order from the
  // categorical theme — never cycled, never reassigned by rank.
  function scoreBars(scores, labels) {
    const keys = Object.keys(labels);
    const present = keys.filter(function (k) { return scores[k] !== null && scores[k] !== undefined; });
    if (!present.length) return h('div.chart-empty', 'Nothing logged this week yet');

    return h('div.scores', present.map(function (k, i) {
      const v = scores[k];
      return h('div.score-row', [
        h('div.score-label', [
          h('span.score-swatch', { class: 'series-' + ((i % 5) + 1) }),
          labels[k]
        ]),
        h('div.score-track', h('div.score-fill', {
          class: 'series-' + ((i % 5) + 1),
          style: { width: U.clamp(v, 0, 100) + '%' }
        })),
        h('div.score-value', v)
      ]);
    }));
  }

  /* ---------------------------------------------------------------- gauge */

  // Single headline number: a ring, not a chart. Used once, for the week.
  function gauge(value, opts) {
    const o = opts || {};
    const size = o.size || 96, stroke = 8, r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const frac = U.clamp((value || 0) / 100, 0, 1);
    const tone = value >= 75 ? 'good' : (value >= 45 ? 'warning' : 'critical');

    const root = svgRoot(size, size, {
      cssHeight: size, preserve: 'xMidYMid meet',
      label: (o.label || 'Score') + ' ' + value + ' out of 100'
    });
    root.setAttribute('style', 'height:' + size + 'px;width:' + size + 'px');
    root.appendChild(h('circle', {
      cx: size / 2, cy: size / 2, r: r, fill: 'none',
      stroke: 'var(--border)', 'stroke-width': stroke
    }));
    root.appendChild(h('circle', {
      cx: size / 2, cy: size / 2, r: r, fill: 'none',
      stroke: 'var(--status-' + tone + ')', 'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-dasharray': U.round(c, 2),
      'stroke-dashoffset': U.round(c * (1 - frac), 2),
      transform: 'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')'
    }));
    return h('div.gauge', [root, h('div.gauge-value', [
      h('strong', String(value)),
      h('span', o.caption || '/100')
    ])]);
  }

  K.Charts = {
    sparkline: sparkline,
    netBars: netBars,
    rankedBars: rankedBars,
    heatmap: heatmap,
    scoreBars: scoreBars,
    gauge: gauge
  };
})(globalThis.Keel = globalThis.Keel || {});
