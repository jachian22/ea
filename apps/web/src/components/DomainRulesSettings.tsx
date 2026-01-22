import { useState } from 'react';
import { Plus, Trash2, Mail, AtSign, User, Tag, Loader2, GripVertical } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Badge } from '~/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';
import { useDomainRules, useCreateDomainRule, useDeleteDomainRule } from '~/hooks/use-domain-rules';
import type { DomainRuleType, PersonDomain, DomainRule } from '~/db/schema';

const RULE_TYPE_LABELS: Record<
  DomainRuleType,
  { label: string; icon: typeof Mail; description: string }
> = {
  email_domain: {
    label: 'Email Domain',
    icon: AtSign,
    description: 'Match emails ending with this domain (e.g., @company.com)',
  },
  email_address: {
    label: 'Email Address',
    icon: Mail,
    description: 'Match a specific email address',
  },
  person: {
    label: 'Person Name',
    icon: User,
    description: 'Match people by name pattern',
  },
  keyword: {
    label: 'Keyword',
    icon: Tag,
    description: 'Match content containing this keyword',
  },
};

const DOMAIN_COLORS: Record<PersonDomain, string> = {
  family: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  business: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  job: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  personal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export function DomainRulesSettings() {
  const { data: rulesResponse, isLoading } = useDomainRules();
  const rules = rulesResponse?.success ? rulesResponse.data || [] : [];

  const rulesByType = rules.reduce(
    (acc, rule) => {
      const type = rule.ruleType as DomainRuleType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(rule);
      return acc;
    },
    {} as Record<DomainRuleType, DomainRule[]>
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Domain Classification Rules</CardTitle>
            <CardDescription>
              Define rules to automatically categorize people and communications
            </CardDescription>
          </div>
          <AddRuleDialog />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick Add Suggestions */}
        <QuickAddSuggestions existingRules={rules} />

        {/* Rules by Type */}
        {Object.entries(RULE_TYPE_LABELS).map(([type, config]) => {
          const typeRules = rulesByType[type as DomainRuleType] || [];
          if (typeRules.length === 0) return null;

          const Icon = config.icon;
          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {config.label}
              </div>
              <div className="space-y-2">
                {typeRules
                  .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
                  .map((rule) => (
                    <RuleItem key={rule.id} rule={rule} />
                  ))}
              </div>
            </div>
          );
        })}

        {rules.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Tag className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No domain rules configured</p>
            <p className="text-sm">Add rules to automatically classify your contacts</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuleItem({ rule }: { rule: DomainRule }) {
  const deleteRule = useDeleteDomainRule();
  const Icon = RULE_TYPE_LABELS[rule.ruleType as DomainRuleType]?.icon || Tag;

  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm">{rule.pattern}</span>
        <Badge className={DOMAIN_COLORS[rule.domain as PersonDomain]}>{rule.domain}</Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => deleteRule.mutate(rule.id)}
        disabled={deleteRule.isPending}
      >
        {deleteRule.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

function AddRuleDialog() {
  const [open, setOpen] = useState(false);
  const [ruleType, setRuleType] = useState<DomainRuleType>('email_domain');
  const [pattern, setPattern] = useState('');
  const [domain, setDomain] = useState<PersonDomain>('business');

  const createRule = useCreateDomainRule();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;

    createRule.mutate(
      {
        ruleType,
        pattern: pattern.trim(),
        domain,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            setOpen(false);
            setPattern('');
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Rule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Domain Rule</DialogTitle>
            <DialogDescription>
              Create a rule to automatically classify contacts into domains
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Rule Type */}
            <div className="space-y-2">
              <Label>Rule Type</Label>
              <Select value={ruleType} onValueChange={(v) => setRuleType(v as DomainRuleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_TYPE_LABELS).map(([type, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={type} value={type}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {config.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {RULE_TYPE_LABELS[ruleType].description}
              </p>
            </div>

            {/* Pattern */}
            <div className="space-y-2">
              <Label>Pattern</Label>
              <Input
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder={
                  ruleType === 'email_domain'
                    ? '@company.com'
                    : ruleType === 'email_address'
                      ? 'person@example.com'
                      : ruleType === 'person'
                        ? 'John'
                        : 'invoice'
                }
              />
              {ruleType === 'email_domain' && !pattern.startsWith('@') && pattern.length > 0 && (
                <p className="text-xs text-yellow-600">
                  Tip: Email domains usually start with @ (e.g., @company.com)
                </p>
              )}
            </div>

            {/* Domain */}
            <div className="space-y-2">
              <Label>Classify as</Label>
              <Select value={domain} onValueChange={(v) => setDomain(v as PersonDomain)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['family', 'business', 'job', 'personal', 'other'] as PersonDomain[]).map(
                    (d) => (
                      <SelectItem key={d} value={d}>
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${DOMAIN_COLORS[d].split(' ')[0]}`}
                          />
                          <span className="capitalize">{d}</span>
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!pattern.trim() || createRule.isPending}>
              {createRule.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Rule'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddSuggestions({ existingRules }: { existingRules: DomainRule[] }) {
  const createRule = useCreateDomainRule();
  const existingPatterns = new Set(existingRules.map((r) => r.pattern.toLowerCase()));

  const suggestions = [
    {
      ruleType: 'email_domain' as DomainRuleType,
      pattern: '@gmail.com',
      domain: 'personal' as PersonDomain,
      label: 'Gmail → Personal',
    },
    {
      ruleType: 'email_domain' as DomainRuleType,
      pattern: '@outlook.com',
      domain: 'personal' as PersonDomain,
      label: 'Outlook → Personal',
    },
    {
      ruleType: 'email_domain' as DomainRuleType,
      pattern: '@yahoo.com',
      domain: 'personal' as PersonDomain,
      label: 'Yahoo → Personal',
    },
    {
      ruleType: 'keyword' as DomainRuleType,
      pattern: 'invoice',
      domain: 'business' as PersonDomain,
      label: 'Invoice → Business',
    },
    {
      ruleType: 'keyword' as DomainRuleType,
      pattern: 'family',
      domain: 'family' as PersonDomain,
      label: 'Family → Family',
    },
  ].filter((s) => !existingPatterns.has(s.pattern.toLowerCase()));

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Quick Add</Label>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <Button
            key={suggestion.pattern}
            variant="outline"
            size="sm"
            onClick={() =>
              createRule.mutate({
                ruleType: suggestion.ruleType,
                pattern: suggestion.pattern,
                domain: suggestion.domain,
              })
            }
            disabled={createRule.isPending}
          >
            <Plus className="mr-1 h-3 w-3" />
            {suggestion.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
