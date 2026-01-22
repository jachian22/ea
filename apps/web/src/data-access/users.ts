import { eq } from 'drizzle-orm';
import { database } from '~/db';
import { user, type User, type CreateUserData } from '~/db/schema';

export async function findUserById(id: string): Promise<User | null> {
  const [result] = await database.select().from(user).where(eq(user.id, id)).limit(1);

  return result || null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [result] = await database
    .select()
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);

  return result || null;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const [newUser] = await database
    .insert(user)
    .values({
      ...data,
      email: data.email.toLowerCase(),
    })
    .returning();

  return newUser;
}

export async function updateUser(
  id: string,
  data: Partial<Omit<CreateUserData, 'id' | 'createdAt'>>
): Promise<User | null> {
  const [updated] = await database
    .update(user)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(user.id, id))
    .returning();

  return updated || null;
}

/**
 * Find or create a user by email (for Google sign-in)
 */
export async function findOrCreateUserByEmail(data: {
  email: string;
  name: string;
  image?: string;
}): Promise<User> {
  const existing = await findUserByEmail(data.email);

  if (existing) {
    // Optionally update name/image if changed
    if (data.name !== existing.name || data.image !== existing.image) {
      const updated = await updateUser(existing.id, {
        name: data.name,
        image: data.image,
      });
      return updated || existing;
    }
    return existing;
  }

  // Create new user
  const { nanoid } = await import('nanoid');
  return createUser({
    id: nanoid(),
    email: data.email,
    name: data.name,
    image: data.image,
    emailVerified: true, // Google emails are verified
  });
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const userData = await findUserById(userId);
  if (!userData) return false;

  return userData.isAdmin;
}
