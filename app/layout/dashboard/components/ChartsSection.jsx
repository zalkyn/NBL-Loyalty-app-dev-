import { ChartCard } from "./Cards";

export function ChartsSection({ chartData, rangeKey, chartOptions }) {
    return (
        <>
            <ChartCard
                heading="Points activity"
                chartKey={`points-${rangeKey}`}
                options={chartOptions(["#1D9E75", "#E24B4A", "#8C6D1F"])}
                series={[
                    { name: "Earned", data: chartData.earned },
                    { name: "Redeemed", data: chartData.redeemed },
                    { name: "Adjustments", data: chartData.adjustments },
                ]}
                type="bar"
                height={320}
            />
            <ChartCard
                heading="Rewards issued"
                chartKey={`rewards-${rangeKey}`}
                options={chartOptions(["#378ADD"])}
                series={[{ name: "Rewards", data: chartData.rewards }]}
                type="area"
                height={280}
            />
        </>
    );
}