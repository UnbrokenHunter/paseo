import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import type { StickyConversationHeaderMode } from "@/hooks/use-settings";
import { formatMessageTimestamp } from "@/utils/time";
import type { StickyConversationPreview, StickyConversationPreviews } from "./model";

/**
 * The row never changes height, so an empty side cannot shift the populated one
 * and the overlay never nudges the messages underneath it.
 */
export const STICKY_CONVERSATION_HEADER_HEIGHT = 46;

// Plain (non-Unistyles) object: `backdropFilter` has no React Native equivalent.
const backdropBlurStyle = isWeb
  ? ({
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as unknown as ViewStyle)
  : null;

interface StickyConversationHeaderProps {
  mode: StickyConversationHeaderMode;
  previews: StickyConversationPreviews;
  onPressPreview: (itemId: string) => void;
}

export function StickyConversationHeader({
  mode,
  previews,
  onPressPreview,
}: StickyConversationHeaderProps) {
  const showAssistantSide = mode === "user-and-ai";
  const assistant = showAssistantSide ? previews.assistant : null;
  const user = previews.user;

  if (mode === "off" || (!assistant && !user)) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="sticky-conversation-header">
      <View style={[styles.backdrop, backdropBlurStyle]} pointerEvents="none" />
      <View style={styles.row} pointerEvents="box-none">
        {showAssistantSide ? (
          <StickySide align="left" role="assistant" preview={assistant} onPress={onPressPreview} />
        ) : null}
        <StickySide align="right" role="user" preview={user} onPress={onPressPreview} />
      </View>
    </View>
  );
}

function sidePressableStyle({ pressed }: PressableStateCallbackType) {
  return pressed ? styles.sidePressed : null;
}

interface StickySideProps {
  align: "left" | "right";
  role: "user" | "assistant";
  preview: StickyConversationPreview | null;
  onPress: (itemId: string) => void;
}

function StickySide({ align, role, preview, onPress }: StickySideProps) {
  const { t } = useTranslation();
  const itemId = preview?.itemId;
  const handlePress = useCallback(() => {
    if (itemId) {
      onPress(itemId);
    }
  }, [itemId, onPress]);
  const timestamp = useMemo(
    () => (preview ? formatMessageTimestamp(new Date(preview.timestamp)) : ""),
    [preview],
  );

  if (!preview) {
    return <View style={styles.side} />;
  }

  const alignmentStyle = align === "left" ? styles.alignStart : styles.alignEnd;
  const textAlignStyle = align === "left" ? styles.textStart : styles.textEnd;

  return (
    <View style={styles.side}>
      <Pressable
        style={sidePressableStyle}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t(
          role === "user"
            ? "agentStream.stickyHeader.userAccessibilityLabel"
            : "agentStream.stickyHeader.assistantAccessibilityLabel",
          { preview: preview.text },
        )}
        testID={`sticky-conversation-preview-${role}`}
      >
        <View style={alignmentStyle}>
          <Text style={[styles.previewText, textAlignStyle]} numberOfLines={1} ellipsizeMode="tail">
            {preview.text}
          </Text>
          <Text style={[styles.timestamp, textAlignStyle]} numberOfLines={1}>
            {timestamp}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: STICKY_CONVERSATION_HEADER_HEIGHT,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface0,
    opacity: 0.82,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  side: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  sidePressed: {
    opacity: 0.7,
  },
  alignStart: {
    alignItems: "flex-start",
  },
  alignEnd: {
    alignItems: "flex-end",
  },
  textStart: {
    textAlign: "left",
  },
  textEnd: {
    textAlign: "right",
  },
  previewText: {
    width: "100%",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  timestamp: {
    width: "100%",
    marginTop: 1,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
}));
