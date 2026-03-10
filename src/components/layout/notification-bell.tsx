'use client';

import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase';
import {
  getRecentNotificationsQuery,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from '@/services/notifications.service';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { firestore, user } = useFirebase();
  const router = useRouter();

  const notificationsQ = useMemoFirebase(
    () => (firestore && user ? getRecentNotificationsQuery(firestore, user.uid) : null),
    [firestore, user],
  );
  const { data: notifications } = useCollection<Notification>(notificationsQ);

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  const handleClick = async (notification: Notification) => {
    if (!firestore) return;
    if (!notification.read) {
      await markNotificationRead(firestore, notification.id);
    }
    if (notification.orderId) {
      router.push(`/controle/${notification.orderId}`);
    }
  };

  const handleMarkAllRead = async () => {
    if (!firestore || !user) return;
    await markAllNotificationsRead(firestore, user.uid);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1"
              onClick={handleMarkAllRead}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {(notifications ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            <div className="divide-y">
              {(notifications ?? []).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors',
                    !n.read && 'bg-primary/5',
                  )}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
