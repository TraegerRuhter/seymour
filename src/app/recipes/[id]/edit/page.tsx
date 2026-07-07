'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRecipeStore } from '@/lib/stores';
import RecipeForm from '@/components/RecipeForm';

export default function EditRecipePage() {
  const { id } = useParams<{ id: string }>();
  const recipe = useRecipeStore((s) => s.recipes[id]);

  if (!recipe) {
    return (
      <div className="py-16 text-center">
        <p className="text-charcoal/60">This recipe doesn&apos;t exist (anymore).</p>
        <Link href="/recipes" className="btn-secondary mt-4">
          Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Edit recipe</h1>
        <p className="mt-1 text-charcoal/60">{recipe.title}</p>
      </header>
      <RecipeForm existing={recipe} />
    </div>
  );
}
