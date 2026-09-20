import Svg, { Circle, G, Path } from "react-native-svg";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../lib/theme";

type Slice = { label: string; value: number; color: string };

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y} Z`;
}

/** Conic-style pie chart matching web SalesPieChart. */
export function PieChart({
  title,
  slices,
  size = 168,
}: {
  title: string;
  slices: Slice[];
  size?: number;
}) {
  const { colors: themeColors } = useTheme();
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const r = size / 2;
  let angle = 0;
  const paths = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const sweep = total > 0 ? (slice.value / total) * 360 : 0;
      const start = angle;
      const end = angle + sweep;
      angle = end;
      return { ...slice, start, end };
    });

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
      {total <= 0 ? (
        <Text style={[styles.empty, { color: themeColors.muted }]}>No revenue yet to chart</Text>
      ) : (
        <View style={styles.row}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <G>
              {paths.length === 1 ? (
                <Circle cx={r} cy={r} r={r - 2} fill={paths[0].color} />
              ) : (
                paths.map((slice) => (
                  <Path
                    key={slice.label}
                    d={arcPath(r, r, r - 2, slice.start, slice.end)}
                    fill={slice.color}
                  />
                ))
              )}
              <Circle cx={r} cy={r} r={r * 0.42} fill={themeColors.card} />
            </G>
          </Svg>
          <View style={styles.legend}>
            {slices.filter((s) => s.value > 0).map((slice) => {
              const pct = Math.round((slice.value / total) * 100);
              return (
                <View key={slice.label} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: slice.color }]} />
                  <Text style={[styles.legendLabel, { color: themeColors.text }]} numberOfLines={1}>
                    {slice.label}
                  </Text>
                  <Text style={[styles.legendPct, { color: themeColors.muted }]}>{pct}%</Text>
                  <Text style={[styles.legendValue, { color: themeColors.text }]}>
                    ₹{Math.round(slice.value).toLocaleString("en-IN")}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  title: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  empty: { fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" },
  legend: { flex: 1, minWidth: 140, gap: 8 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
  legendPct: { width: 36, textAlign: "right", fontSize: 12, fontWeight: "700" },
  legendValue: { minWidth: 64, textAlign: "right", fontSize: 12, fontWeight: "700" },
});
