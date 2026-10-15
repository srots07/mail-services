"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client/api";
import { Send, CheckCircle2, MailCheck } from "lucide-react";

export function QuickTestSend({ defaultSenderEmail = "" }: { defaultSenderEmail?: string }) {
  const [recipient, setRecipient] = useState(defaultSenderEmail);
  const [loading, setLoading] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const toast = useToast();

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient) {
      toast.error("Please enter a recipient email address");
      return;
    }
    setLoading(true);
    setSentSuccess(false);
    try {
      await api("/api/email-account/smtp/test", {
        method: "POST",
        body: { toEmail: recipient.trim() },
      });
      setSentSuccess(true);
      toast.success("Test email delivered!", `Sent to ${recipient}`);
    } catch (err: unknown) {
      toast.error("Test send failed", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Live Test Email Sender"
        description="Verify your active sending mailbox credentials and check inbox delivery by dispatching a real-time test email."
      />
      <CardBody className="space-y-3">
        <form onSubmit={handleSend} className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              placeholder="Enter your personal or test email (e.g. you@gmail.com)"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="flex-1"
              required
            />
            <Button variant="primary" type="submit" loading={loading} className="shrink-0">
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Send Test Email
            </Button>
          </div>
          {sentSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Test email delivered! Your email server accepted the message. Check your inbox or spam folder.</span>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
