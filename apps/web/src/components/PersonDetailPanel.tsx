import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  User,
  Mail,
  Phone,
  Building,
  Briefcase,
  Calendar,
  MessageSquare,
  CheckCircle,
  Clock,
  Star,
  Edit,
  X,
  Loader2,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { usePersonContext } from "~/hooks/use-knowledge";
import type { PersonDomain, RelationType } from "~/db/schema";

interface PersonDetailPanelProps {
  personId: string;
  onClose?: () => void;
}

const DOMAIN_COLORS: Record<PersonDomain, string> = {
  family: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  business: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  job: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  personal: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const RELATION_LABELS: Record<RelationType, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  friend: "Friend",
  client: "Client",
  vendor: "Vendor",
  colleague: "Colleague",
  manager: "Manager",
  report: "Direct Report",
  investor: "Investor",
  partner: "Partner",
  other: "Other",
};

export function PersonDetailPanel({ personId, onClose }: PersonDetailPanelProps) {
  const { data: contextResponse, isLoading } = usePersonContext(personId);
  const context = contextResponse?.success ? contextResponse.data : null;

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!context?.person) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center h-full gap-2">
          <User className="h-12 w-12 text-muted-foreground opacity-20" />
          <p className="text-muted-foreground">Person not found</p>
        </CardContent>
      </Card>
    );
  }

  const { person, relationships } = context;
  const recentInteractions = person.recentInteractions;
  const commitmentsYouOwe = person.openCommitmentsYouOwe;
  const commitmentsTheyOwe = person.openCommitmentsTheyOwe;
  const interactionStats = person.interactionStats;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {person.name || person.email}
                {person.importanceScore && person.importanceScore >= 80 && (
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                {person.role && person.company && (
                  <span>
                    {person.role} at {person.company}
                  </span>
                )}
                {!person.role && person.company && <span>{person.company}</span>}
                {person.domain && (
                  <Badge className={DOMAIN_COLORS[person.domain as PersonDomain]} variant="secondary">
                    {person.domain}
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="interactions">
              Interactions
              {recentInteractions.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {recentInteractions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="commitments">
              Commitments
              {(commitmentsYouOwe.length + commitmentsTheyOwe.length) > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {commitmentsYouOwe.length + commitmentsTheyOwe.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            <TabsContent value="overview" className="m-0 space-y-6">
              {/* Contact Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Contact</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{person.email}</span>
                  </div>
                  {person.emails && person.emails.length > 1 && (
                    <div className="pl-6 space-y-1">
                      {person.emails
                        .filter((e: string) => e !== person.email)
                        .map((email: string) => (
                          <div key={email} className="text-sm text-muted-foreground">
                            {email}
                          </div>
                        ))}
                    </div>
                  )}
                  {person.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{person.phone}</span>
                    </div>
                  )}
                  {person.company && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span>{person.company}</span>
                    </div>
                  )}
                  {person.role && (
                    <div className="flex items-center gap-2 text-sm">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span>{person.role}</span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Relationships */}
              {relationships.length > 0 && (
                <>
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Relationship</h4>
                    <div className="flex flex-wrap gap-2">
                      {relationships.map((rel) => (
                        <Badge key={rel.id} variant="outline">
                          {RELATION_LABELS[rel.relationType as RelationType] || rel.relationType}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Interaction Stats */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Interaction History</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{interactionStats?.totalInteractions || 0}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {interactionStats?.lastContactAt
                        ? formatDistanceToNow(new Date(interactionStats.lastContactAt), { addSuffix: true })
                        : "Never"}
                    </div>
                    <div className="text-xs text-muted-foreground">Last Contact</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold capitalize">
                      {interactionStats?.averageFrequencyDays
                        ? `~${interactionStats.averageFrequencyDays}d`
                        : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg. Frequency</div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              {person.personalNotes && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
                  <p className="text-sm whitespace-pre-wrap">{person.personalNotes}</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="interactions" className="m-0 space-y-4">
              {recentInteractions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No interactions recorded</p>
                </div>
              ) : (
                recentInteractions.map((interaction) => (
                  <InteractionCard key={interaction.id} interaction={interaction} />
                ))
              )}
            </TabsContent>

            <TabsContent value="commitments" className="m-0 space-y-4">
              {commitmentsYouOwe.length === 0 && commitmentsTheyOwe.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>No open commitments</p>
                </div>
              ) : (
                <>
                  {/* You Owe Them */}
                  {commitmentsYouOwe.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">You Owe Them</h4>
                      {commitmentsYouOwe.map((commitment) => (
                        <CommitmentCard key={commitment.id} commitment={commitment} />
                      ))}
                    </div>
                  )}

                  {/* They Owe You */}
                  {commitmentsTheyOwe.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">They Owe You</h4>
                      {commitmentsTheyOwe.map((commitment) => (
                        <CommitmentCard key={commitment.id} commitment={commitment} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface DossierInteraction {
  id: string;
  type: string;
  channel: string;
  subject: string | null;
  summary: string | null;
  occurredAt: Date;
}

interface DossierCommitment {
  id: string;
  description: string;
  dueDate: Date | null;
  status: string;
}

function InteractionCard({ interaction }: { interaction: DossierInteraction }) {
  const getIcon = () => {
    switch (interaction.type) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "meeting":
        return <Calendar className="h-4 w-4" />;
      case "call":
        return <Phone className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getTypeLabel = () => {
    switch (interaction.type) {
      case "email":
        return "Email";
      case "meeting":
        return "Meeting";
      case "call":
        return "Call";
      case "message":
        return "Message";
      default:
        return interaction.type;
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {getIcon()}
          <span className="font-medium">{getTypeLabel()}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(interaction.occurredAt), "MMM d, yyyy")}
        </span>
      </div>
      {interaction.summary && (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {interaction.summary}
        </p>
      )}
    </div>
  );
}

function CommitmentCard({ commitment }: { commitment: DossierCommitment }) {
  const isOverdue =
    commitment.dueDate && new Date(commitment.dueDate) < new Date() && commitment.status === "pending";

  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${
        isOverdue ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm flex-1">{commitment.description}</p>
        <Badge
          variant={commitment.status === "completed" ? "default" : "outline"}
          className={isOverdue ? "bg-red-100 text-red-800 border-red-300" : ""}
        >
          {isOverdue ? "Overdue" : commitment.status}
        </Badge>
      </div>
      {commitment.dueDate && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Due {format(new Date(commitment.dueDate), "MMM d, yyyy")}
        </div>
      )}
    </div>
  );
}
