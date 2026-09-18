"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const SelectLayoutContext = React.createContext<{
  width: number | undefined;
  setTrigger: (node: HTMLElement | null) => void;
}>({ width: undefined, setTrigger: () => {} });

function SelectRoot<Value = string>(props: SelectPrimitive.Root.Props<Value>) {
  const [width, setWidth] = React.useState<number>();
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const setTrigger = React.useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) {
      setWidth(undefined);
      return;
    }
    const update = () => setWidth(node.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  React.useEffect(() => () => observerRef.current?.disconnect(), []);

  const value = React.useMemo(() => ({ width, setTrigger }), [width, setTrigger]);

  return (
    <SelectLayoutContext.Provider value={value}>
      <SelectPrimitive.Root {...props} />
    </SelectLayoutContext.Provider>
  );
}

function staticClassName(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function SelectTrigger({
  className,
  children,
  ref,
  ...props
}: SelectPrimitive.Trigger.Props) {
  const { setTrigger } = React.useContext(SelectLayoutContext);

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      {...props}
      ref={(node) => {
        setTrigger(node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        "flex h-11 w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-950 outline-none transition select-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-blue-500 data-[popup-open]:ring-4 data-[popup-open]:ring-blue-100",
        staticClassName(className),
      )}
    >
      {children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="size-4 shrink-0 text-slate-400" />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("min-w-0 flex-1 truncate text-left", staticClassName(className))}
      {...props}
    />
  );
}

function SelectContent({
  className,
  children,
  style,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset" | "alignItemWithTrigger">) {
  const { width } = React.useContext(SelectLayoutContext);
  const sized = width && width > 0 ? width : "var(--anchor-width)";
  const sizeStyle: React.CSSProperties = {
    boxSizing: "border-box",
    width: sized,
    minWidth: sized,
  };

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="z-50 outline-none"
        style={sizeStyle}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          {...props}
          style={{ ...sizeStyle, ...style }}
          className={cn(
            "max-h-80 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-slate-950 shadow-lg outline-none",
            "origin-[var(--transform-origin)] transition data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            staticClassName(className),
          )}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg py-2 pr-2.5 pl-2.5 text-sm outline-none select-none data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        staticClassName(className),
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
        <SelectPrimitive.ItemIndicator className="text-blue-700">
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
}

export { SelectRoot as Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
