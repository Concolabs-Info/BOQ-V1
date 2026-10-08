"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type GroupProps,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<GroupProps, "orientation"> & {
  autoSaveId?: string;
  direction: "horizontal" | "vertical";
};

const serverStorage = {
  getItem: () => null,
  setItem: () => undefined,
};

const ResizablePanelGroup = ({
  autoSaveId,
  className,
  defaultLayout,
  direction,
  onLayoutChanged,
  ...props
}: ResizablePanelGroupProps) => {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const storage = hydrated ? window.localStorage : serverStorage;
  const persisted = useDefaultLayout({
    id: autoSaveId ?? "resizable-panel-group",
    storage,
  });

  return (
    <Group
      key={hydrated ? "persisted" : "default"}
      orientation={direction}
      defaultLayout={defaultLayout ?? persisted.defaultLayout}
      onLayoutChanged={onLayoutChanged ?? (hydrated ? persisted.onLayoutChanged : undefined)}
      className={cn("flex h-full w-full", direction === "vertical" && "flex-col", className)}
      {...props}
    />
  );
};

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      className
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-8 w-4 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-4 w-4" />
      </div>
    ) : null}
  </Separator>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
