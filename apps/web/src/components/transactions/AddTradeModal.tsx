import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ManualTradeForm } from "@/components/portfolio/ManualTradeForm";
import { Plus } from "lucide-react";
import { useState } from "react";

export function AddTradeModal({onSuccess}:{onSuccess?:()=>void}={}) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Trade
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add Manual Trade</DialogTitle>
                    <DialogDescription>
                        Manually add a stock or crypto trade to your portfolio.
                    </DialogDescription>
                </DialogHeader>
                <ManualTradeForm onSuccess={() => {setOpen(false);onSuccess?.();}} />
            </DialogContent>
        </Dialog>
    );
}
