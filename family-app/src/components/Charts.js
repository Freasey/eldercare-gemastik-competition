/**
 * Grafik riwayat, dipindahkan dari mockup HTML ke react-native-svg.
 *
 * Dua aturan dari mockup yang ikut dibawa:
 * 1. Warna tidak pernah jadi satu-satunya pembeda hari bermasalah diberi
 *    penanda bentuk (titik) + keterangan di legenda.
 * 2. Setiap grafik punya versi tabel, supaya isinya tetap terbaca kalau
 *    grafiknya sulit dicerna.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Circle, G, Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';
import { font, type, useColors } from '../theme/theme.js';
import { Note } from './ui.js';
import { MOOD_LABEL, tanggal, toDate } from '../lib/format.js';

/* ---------------- kerangka bersama ---------------- */

function ChartShell({ children, legend, table }) {
  const c = useColors();
  const [showTable, setShowTable] = useState(false);

  return (
    <View style={{ gap: 10 }}>
      {children}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {legend.map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color }} />
            <Text style={[type.sub, { color: c.ink2 }]}>{l.label}</Text>
          </View>
        ))}
      </View>

      <Pressable onPress={() => setShowTable((v) => !v)} hitSlop={6}>
        <Text style={[type.chip, { color: c.accentInk }]}>
          {showTable ? 'Sembunyikan tabel' : 'Lihat sebagai tabel'}
        </Text>
      </Pressable>

      {showTable ? <DataTable head={table.head} rows={table.rows} /> : null}
    </View>
  );
}

function DataTable({ head, rows }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, borderRadius: 10 }}>
      <View style={{ flexDirection: 'row', backgroundColor: c.surface2 }}>
        {head.map((h) => (
          <Text
            key={h}
            style={{ flex: 1, padding: 9, fontFamily: font.bold, fontSize: 11.5, color: c.ink2 }}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.line,
          }}
        >
          {r.map((cell, j) => (
            <Text key={j} style={{ flex: 1, padding: 9, fontFamily: font.regular, fontSize: 12.5, color: c.ink }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Balon keterangan yang muncul saat sebuah titik/batang disentuh. */
function Tooltip({ text }) {
  const c = useColors();
  if (!text) return null;
  return (
    <View
      style={{
        marginTop: 2,
        alignSelf: 'flex-start',
        backgroundColor: c.ink,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
      }}
    >
      <Text style={{ color: c.surface, fontFamily: font.medium, fontSize: 12 }}>{text}</Text>
    </View>
  );
}

/** Lebar grafik mengikuti lebar kartu; diukur sekali lewat onLayout. */
function useChartWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e) => setWidth(e.nativeEvent.layout.width);
  return [width, onLayout];
}

/* ---------------- kepatuhan minum obat ---------------- */

/** @param {{data: {date: string, taken: number, total: number}[]}} props */
export function AdherenceChart({ data }) {
  const c = useColors();
  const [width, onLayout] = useChartWidth();
  const [tip, setTip] = useState(null);

  const H = 140;
  const padL = 26;
  const padR = 4;
  const padT = 12;
  const padB = 20;

  return (
    <View onLayout={onLayout}>
      <ChartShell
        // Kedua label menyebut BAGIAN batang, bukan sifat harinya batangnya
        // sekarang bertumpuk, jadi satu hari bisa punya dua-duanya sekaligus.
        legend={[
          { color: c.series1, label: 'Sudah diminum' },
          { color: c.critical, label: 'Terlewat' },
        ]}
        table={{
          head: ['Tanggal', 'Diminum', 'Total'],
          rows: data.map((d) => [tanggal(d.date), String(d.taken), String(d.total)]),
        }}
      >
        {width > 0 && data.length > 0 ? (
          <>
            <Svg width={width} height={H}>
              {(() => {
                const plotW = width - padL - padR;
                const plotH = H - padT - padB;
                const slot = plotW / data.length;
                const barW = Math.min(20, slot - 5);

                return (
                  <>
                    {[0, 50, 100].map((v) => {
                      const y = padT + plotH - (v / 100) * plotH;
                      return (
                        <G key={v}>
                          <Line x1={padL} y1={y} x2={width - padR} y2={y} stroke={c.grid} strokeWidth={1} />
                          <SvgText x={padL - 7} y={y + 3.5} textAnchor="end" fontSize={9} fill={c.ink3}>
                            {v}
                          </SvgText>
                        </G>
                      );
                    })}

                    <Line
                      x1={padL}
                      y1={padT + plotH}
                      x2={width - padR}
                      y2={padT + plotH}
                      stroke={c.axis}
                      strokeWidth={1}
                    />

                    {data.map((d, i) => {
                      // Batang bertumpuk: seluruh tingginya adalah total dosis
                      // hari itu, bagian bawah (teal) yang sudah diminum dan
                      // bagian atas (merah) yang terlewat. Versi sebelumnya
                      // memakai satu batang yang BERGANTI warna kalau ada yang
                      // terlewat, jadi hari dengan 3 dari 4 dosis terlihat sama
                      // merahnya dengan hari yang tidak minum sama sekali.
                      const x = padL + i * slot + (slot - barW) / 2;
                      const yTop = padT;
                      const kurang = d.taken < d.total;
                      const rasio = d.total ? d.taken / d.total : 0;
                      const hDiminum = Math.max(d.taken > 0 ? 2 : 0, rasio * plotH);
                      const hTerlewat = plotH - hDiminum;
                      const r = Math.min(4, plotH);
                      const dd = toDate(d.date);

                      return (
                        <G key={d.date}>
                          {/* Bagian terlewat menempel di puncak, jadi sudut
                              membulatnya ada di atas. */}
                          {kurang && hTerlewat > 0 ? (
                            <Path
                              d={
                                `M${x} ${yTop + hTerlewat} L${x} ${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} ` +
                                `L${x + barW - r} ${yTop} Q${x + barW} ${yTop} ${x + barW} ${yTop + r} ` +
                                `L${x + barW} ${yTop + hTerlewat} Z`
                              }
                              fill={c.critical}
                            />
                          ) : null}

                          {hDiminum > 0 ? (
                            <Path
                              d={
                                kurang
                                  ? `M${x} ${yTop + plotH} L${x} ${yTop + hTerlewat} ` +
                                    `L${x + barW} ${yTop + hTerlewat} L${x + barW} ${yTop + plotH} Z`
                                  : `M${x} ${yTop + plotH} L${x} ${yTop + r} Q${x} ${yTop} ${x + r} ${yTop} ` +
                                    `L${x + barW - r} ${yTop} Q${x + barW} ${yTop} ${x + barW} ${yTop + r} ` +
                                    `L${x + barW} ${yTop + plotH} Z`
                              }
                              fill={c.series1}
                            />
                          ) : null}

                          {kurang ? (
                            <Circle cx={x + barW / 2} cy={yTop - 6} r={2.6} fill={c.critical} />
                          ) : null}
                          {data.length <= 7 || i % 2 === 0 ? (
                            <SvgText
                              x={padL + i * slot + slot / 2}
                              y={H - 5}
                              textAnchor="middle"
                              fontSize={9}
                              fill={c.ink3}
                            >
                              {dd.getDate()}
                            </SvgText>
                          ) : null}
                          <Rect
                            x={padL + i * slot}
                            y={padT}
                            width={slot}
                            height={plotH}
                            fill="transparent"
                            onPress={() =>
                              setTip(
                                `${tanggal(d.date)} · ${d.taken} dari ${d.total} dosis` +
                                  (kurang ? ' · ada yang terlewat' : ''),
                              )
                            }
                          />
                        </G>
                      );
                    })}
                  </>
                );
              })()}
            </Svg>
            <Tooltip text={tip} />
          </>
        ) : (
          <View style={{ height: H }} />
        )}
      </ChartShell>
    </View>
  );
}

/* ---------------- suasana hati ---------------- */

/** @param {{data: {date: string, score: number}[]}} props */
export function MoodChart({ data }) {
  const c = useColors();
  const [width, onLayout] = useChartWidth();
  const [tip, setTip] = useState(null);

  const H = 136;
  const padL = 26;
  const padR = 8;
  const padT = 14;
  const padB = 20;

  return (
    <View onLayout={onLayout}>
      <ChartShell
        legend={[{ color: c.warning, label: 'Hari dengan suasana hati rendah' }]}
        table={{
          head: ['Tanggal', 'Skor', 'Keterangan'],
          rows: data.map((p) => [tanggal(p.date), `${p.score}/5`, MOOD_LABEL[Math.round(p.score)]]),
        }}
      >
        {width > 0 && data.length > 0 ? (
          <>
            <Svg width={width} height={H}>
              {(() => {
                const plotW = width - padL - padR;
                const plotH = H - padT - padB;
                const n = data.length;
                const x = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
                const y = (v) => padT + plotH - ((v - 1) / 4) * plotH;

                const line = data
                  .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`)
                  .join(' ');
                const area =
                  `M${x(0)} ${padT + plotH} ` +
                  data.map((p, i) => `L${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ') +
                  ` L${x(n - 1)} ${padT + plotH} Z`;

                return (
                  <>
                    {[1, 3, 5].map((v) => (
                      <G key={v}>
                        <Line x1={padL} y1={y(v)} x2={width - padR} y2={y(v)} stroke={c.grid} strokeWidth={1} />
                        <SvgText x={padL - 7} y={y(v) + 3.5} textAnchor="end" fontSize={9} fill={c.ink3}>
                          {v}
                        </SvgText>
                      </G>
                    ))}

                    <Path d={area} fill={c.series1} fillOpacity={0.08} />
                    <Path
                      d={line}
                      fill="none"
                      stroke={c.series1}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {data.map((p, i) => {
                      const rendah = p.score <= 2;
                      return (
                        <G key={p.date}>
                          <Circle
                            cx={x(i)}
                            cy={y(p.score)}
                            r={rendah ? 4.5 : 3.4}
                            fill={rendah ? c.warning : c.series1}
                            stroke={c.surface}
                            strokeWidth={2}
                          />
                          <Rect
                            x={x(i) - plotW / n / 2}
                            y={padT}
                            width={plotW / n}
                            height={plotH}
                            fill="transparent"
                            onPress={() =>
                              setTip(
                                `${tanggal(p.date)} · ${p.score} dari 5 · ${MOOD_LABEL[Math.round(p.score)]}`,
                              )
                            }
                          />
                          {i === 0 || i === n - 1 ? (
                            <SvgText
                              x={x(i)}
                              y={H - 5}
                              textAnchor={i === 0 ? 'start' : 'end'}
                              fontSize={9}
                              fill={c.ink3}
                            >
                              {tanggal(p.date).split(', ')[1]}
                            </SvgText>
                          ) : null}
                        </G>
                      );
                    })}
                  </>
                );
              })()}
            </Svg>
            <Tooltip text={tip} />
          </>
        ) : (
          <View style={{ height: H }} />
        )}
      </ChartShell>
    </View>
  );
}

/** Angka besar di atas grafik: "82%" + keterangan kecil. */
export function ChartHero({ value, note }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
      <Text style={[type.statNumber, { color: c.accentInk }]}>{value}</Text>
      <Note style={{ flex: 1 }}>{note}</Note>
    </View>
  );
}
