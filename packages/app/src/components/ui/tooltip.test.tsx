import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip, TooltipTrigger } from "./tooltip";

vi.mock("@/constants/platform", () => ({
  isWeb: true,
  isNative: false,
}));

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => false,
}));

vi.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@gorhom/bottom-sheet", () => ({
  useBottomSheetModalInternal: () => null,
}));

vi.mock("react-native-reanimated", () => ({
  default: {
    View: "div",
  },
  FadeIn: {},
  FadeOut: {},
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (styles: unknown) => styles,
  },
}));

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("navigator", dom.window.navigator);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function renderTrigger({
  childDisabled,
  onPress,
}: {
  childDisabled: boolean;
  onPress: () => void;
}): void {
  act(() => {
    root?.render(
      <Tooltip>
        <TooltipTrigger asChild>
          <Pressable disabled={childDisabled} onPress={onPress} testID="trigger">
            <Text>Send</Text>
          </Pressable>
        </TooltipTrigger>
      </Tooltip>,
    );
  });
}

function pressTrigger(): void {
  const trigger = container?.querySelector('[data-testid="trigger"]');
  expect(trigger).not.toBeNull();

  act(() => {
    trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

/** The meter drives its tooltip controlled, which is where pinning has to hold. */
function renderPinnable(): { openStates: boolean[] } {
  const openStates: boolean[] = [];

  function Harness() {
    const [open, setOpen] = React.useState(false);
    const handleOpenChange = React.useCallback((next: boolean) => {
      openStates.push(next);
      setOpen(next);
    }, []);
    return (
      <Tooltip open={open} onOpenChange={handleOpenChange} pinnable delayDuration={0}>
        <TooltipTrigger asChild>
          <Pressable testID="trigger">
            <Text>Meter</Text>
          </Pressable>
        </TooltipTrigger>
      </Tooltip>
    );
  }

  act(() => {
    root?.render(<Harness />);
  });
  return { openStates };
}

function dispatchOnTrigger(type: string): void {
  const trigger = container?.querySelector('[data-testid="trigger"]');
  expect(trigger).not.toBeNull();
  act(() => {
    trigger?.dispatchEvent(new window.MouseEvent(type, { bubbles: true }));
  });
}

describe("Tooltip pinning", () => {
  it("stays open after the pointer leaves a trigger that was pressed", () => {
    const { openStates } = renderPinnable();

    dispatchOnTrigger("mouseenter");
    expect(openStates.at(-1)).toBe(true);

    dispatchOnTrigger("click");
    dispatchOnTrigger("mouseleave");

    expect(openStates.at(-1)).toBe(true);
  });

  it("closes on the pointer leaving once a second press releases the pin", () => {
    const { openStates } = renderPinnable();

    dispatchOnTrigger("mouseenter");
    dispatchOnTrigger("click");
    dispatchOnTrigger("click");
    dispatchOnTrigger("mouseleave");

    expect(openStates.at(-1)).toBe(false);
  });

  it("closes on the pointer leaving when the trigger was never pressed", () => {
    const { openStates } = renderPinnable();

    dispatchOnTrigger("mouseenter");
    dispatchOnTrigger("mouseleave");

    expect(openStates.at(-1)).toBe(false);
  });
});

describe("TooltipTrigger", () => {
  it("keeps an asChild trigger disabled when the child is disabled", () => {
    const onPress = vi.fn();

    renderTrigger({ childDisabled: true, onPress });
    pressTrigger();

    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps an asChild trigger interactive when the child is not disabled", () => {
    const onPress = vi.fn();

    renderTrigger({ childDisabled: false, onPress });
    pressTrigger();

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
