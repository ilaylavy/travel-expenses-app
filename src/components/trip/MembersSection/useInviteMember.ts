import { useState } from "react";

import {
  getExistingMember,
  inviteMember as dbInviteMember,
} from "@/db/queries/tripMembers";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/services/supabase";
import { syncEngine } from "@/sync/syncEngine";

interface LookupResult {
  user_id?: string;
  name?: string;
  avatar_url?: string | null;
  error?: string;
}

export function useInviteMember({
  tripId,
  currentUserId,
  onInvited,
}: {
  tripId: string;
  currentUserId: string | null;
  onInvited: () => void | Promise<void>;
}) {
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleInvite = async (): Promise<void> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setInviting(true);
    setInviteError(null);
    try {
      const { data, error } = await supabase.functions.invoke<LookupResult>(
        "lookup-profile-by-email",
        { body: { email: trimmed } },
      );
      if (error) {
        const status = (error as { context?: { status?: number } }).context
          ?.status;
        if (status === 404) {
          setInviteError(t("tripSettings.members.inviteNotFound"));
        } else {
          setInviteError(
            error.message || t("tripSettings.members.inviteFailed"),
          );
        }
        return;
      }
      if (!data?.user_id) {
        setInviteError(t("tripSettings.members.inviteNotFound"));
        return;
      }
      if (data.user_id === currentUserId) {
        setInviteError(t("tripSettings.members.cannotInviteSelf"));
        return;
      }
      const existing = await getExistingMember(tripId, data.user_id);
      if (existing) {
        setInviteError(t("tripSettings.members.alreadyMember"));
        return;
      }
      await dbInviteMember(tripId, data.user_id);
      void syncEngine.triggerSync();
      setEmail("");
      await onInvited();
    } catch (e) {
      console.warn("invite failed:", e);
      setInviteError(
        e instanceof Error ? e.message : t("tripSettings.members.inviteFailed"),
      );
    } finally {
      setInviting(false);
    }
  };

  return {
    email,
    setEmail,
    inviting,
    inviteError,
    setInviteError,
    handleInvite,
  };
}
