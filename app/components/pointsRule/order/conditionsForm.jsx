import { useAtom } from "jotai";
import {
    conditionsAtom,
} from "@atoms/pointsRule";
import EarningMethod from "../earningMethod";
import FixedPoints from "../fixedPoints";
import IncrementalPoints from "../incrementalPoints"
import ExcludedProducts from "../excludedProducts";
import AppliesType from "../appliesType"
import ResourceSelector from "../resourceSelector"

export default function OrderConditionsForm() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    return <s-box>
        <s-box paddingBlockEnd="base">
            <EarningMethod />
        </s-box>

        <s-box paddingBlockEnd="base">
            {conditions.earning?.type === "incremental" ?
                <IncrementalPoints /> :
                <FixedPoints />
            }
        </s-box>

        <s-box paddingBlockEnd="base">
            <AppliesType />
        </s-box>

        {conditions?.appliesTo?.type === 'specificProducts' &&
            <s-box paddingBlockEnd="base">
                <ResourceSelector
                    label="Select Specific Products"
                    resourceType="product"
                    field="products"
                    info="Only selected products are eligible for earning points."
                />
            </s-box>
        }
        {conditions?.appliesTo?.type === 'specificCollections' &&
            <s-box paddingBlockEnd="base">
                <ResourceSelector
                    label="Select Specific Collection"
                    resourceType="collection"
                    field="collections"
                    info="Only products from selected collections are eligible for earning points."
                />
            </s-box>
        }

        {conditions?.appliesTo?.type === 'allProducts' &&
            <s-box>
                <ExcludedProducts />
            </s-box>
        }
    </s-box>
}