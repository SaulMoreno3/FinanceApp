import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { postAPI } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface ManualTradeFormProps {
    onSuccess?: () => void;
}

export function ManualTradeForm({ onSuccess }: ManualTradeFormProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        symbol: "",
        assetType: "Stock",
        side: "Buy",
        quantity: "",
        price: "",
        totalValue: "",
        currency: "EUR",
        fees: "0",
        commission: "0",
        eurCost: "",
        conversionRate: ""
    });

    // Auto-calculate logic
    const handleValueChange = (name: string, value: string) => {
        const newData = { ...formData, [name]: value };

        const qty = parseFloat(newData.quantity);
        const price = parseFloat(newData.price);
        const total = parseFloat(newData.totalValue);

        if (name === "quantity" && !isNaN(price)) {
            newData.totalValue = (qty * price).toFixed(2);
        } else if (name === "price" && !isNaN(qty)) {
            newData.totalValue = (qty * price).toFixed(2);
        } else if (name === "totalValue") {
            // Prioritize calculating Price if Quantity exists (Keep Qty fixed)
            if (!isNaN(qty) && qty !== 0) {
                newData.price = (total / qty).toFixed(6);
            } else if (!isNaN(price) && price !== 0) {
                newData.quantity = (total / price).toFixed(6);
            }
        }

        // Exchange Rate Auto-calc
        if ((name === "eurCost" || name === "totalValue") && newData.currency !== "EUR") {
            const eur = parseFloat(newData.eurCost);
            const val = parseFloat(newData.totalValue);
            if (!isNaN(eur) && !isNaN(val) && val !== 0) {
                newData.conversionRate = (eur / val).toFixed(6);
            }
        }

        setFormData(newData);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleValueChange(e.target.name, e.target.value);
    };

    const handleSelectChange = (name: string, value: string) => {
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await postAPI("/portfolio/trade", {
                ...formData,
                quantity: parseFloat(formData.quantity),
                price: parseFloat(formData.price),
                fees: parseFloat(formData.fees),
                commission: parseFloat(formData.commission),
                eurCost: formData.eurCost ? parseFloat(formData.eurCost) : undefined,
                conversionRate: formData.conversionRate ? parseFloat(formData.conversionRate) : undefined,
            });
            alert("Trade added successfully!");
            if (onSuccess) onSuccess();
            else {
                // Reset if no callback
                setFormData({
                    date: new Date().toISOString().split('T')[0],
                    symbol: "",
                    assetType: "Stock",
                    side: "Buy",
                    quantity: "",
                    price: "",
                    totalValue: "",
                    currency: "EUR",
                    fees: "0",
                    commission: "0",
                    eurCost: "",
                    conversionRate: ""
                });
            }
        } catch (error) {
            console.error(error);
            alert("Failed to add trade");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                        id="date"
                        name="date"
                        type="date"
                        required
                        value={formData.date}
                        onChange={handleChange}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="assetType">Asset Type</Label>
                    <Select
                        value={formData.assetType}
                        onValueChange={(v) => handleSelectChange("assetType", v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Stock">Stock</SelectItem>
                            <SelectItem value="Crypto">Crypto</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input
                        id="symbol"
                        name="symbol"
                        placeholder="BTC-USD, AAPL"
                        required
                        value={formData.symbol}
                        onChange={handleChange}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                        value={formData.currency}
                        onValueChange={(v) => handleSelectChange("currency", v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                        id="quantity"
                        name="quantity"
                        type="number"
                        step="any"
                        placeholder="Qty"
                        required
                        value={formData.quantity}
                        onChange={handleChange}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="price">Price Unit</Label>
                    <Input
                        id="price"
                        name="price"
                        type="number"
                        step="any"
                        placeholder="Price"
                        required
                        value={formData.price}
                        onChange={handleChange}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="totalValue">Total</Label>
                    <Input
                        id="totalValue"
                        name="totalValue"
                        type="number"
                        step="any"
                        placeholder="Total"
                        value={formData.totalValue}
                        onChange={handleChange}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="side">Side</Label>
                    <Select
                        value={formData.side}
                        onValueChange={(v) => handleSelectChange("side", v)}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select side" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Buy">Buy</SelectItem>
                            <SelectItem value="Sell">Sell</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="fees">Fees</Label>
                    <Input
                        id="fees"
                        name="fees"
                        type="number"
                        step="any"
                        value={formData.fees}
                        onChange={handleChange}
                    />
                </div>
            </div>

            {formData.currency !== "EUR" && (
                <div className="p-4 border rounded-md bg-muted/50 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="eurCost">Total EUR Cost</Label>
                            <Input
                                id="eurCost"
                                name="eurCost"
                                type="number"
                                step="any"
                                placeholder="Total spent in EUR"
                                value={formData.eurCost}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="conversionRate">Rate (Auto)</Label>
                            <Input
                                id="conversionRate"
                                name="conversionRate"
                                type="number"
                                step="any"
                                placeholder="EUR / Unit"
                                readOnly
                                disabled
                                value={formData.conversionRate}
                            />
                        </div>
                    </div>
                </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Trade
            </Button>
        </form>
    );
}
