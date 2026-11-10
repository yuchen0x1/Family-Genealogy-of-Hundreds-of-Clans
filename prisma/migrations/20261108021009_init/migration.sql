-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EvidenceLevel" AS ENUM ('DOCUMENTED', 'TRADITION', 'INFERRED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL_HISTORY', 'LOCAL_GAZETTEER', 'ARCHIVE', 'ACADEMIC', 'GENEALOGY', 'FOLK_MATERIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceCredibility" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY', 'UNRATED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'FAMILY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "SurnameCategory" AS ENUM ('SINGLE', 'COMPOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('EXACT', 'YEAR', 'MONTH', 'RANGE', 'APPROXIMATE', 'TEXT_ONLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('PARENT_CHILD', 'SPOUSE', 'SIBLING', 'ADOPTION', 'SUCCESSION', 'GUARDIANSHIP', 'CROSS_FAMILY_LINK');

-- CreateEnum
CREATE TYPE "RelationSubtype" AS ENUM ('BIOLOGICAL', 'ADOPTIVE', 'STEP', 'FOSTER', 'FULL', 'HALF_PATERNAL', 'HALF_MATERNAL', 'MARRIAGE', 'CONCUBINAGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'DISPUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FamilyPermissionCode" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "CollaboratorStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'DECLINED');

-- CreateEnum
CREATE TYPE "PlaceType" AS ENUM ('PROVINCE', 'CITY', 'COUNTY', 'TOWNSHIP', 'VILLAGE', 'REGION', 'SITE');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('OLD_GENEALOGY', 'PHOTO', 'HISTORICAL_DOCUMENT', 'PDF', 'TEXT', 'AUDIO', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('NONE', 'QUEUED', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('SEEK_RELATIVE', 'DISCUSSION', 'ANNOUNCEMENT', 'EVENT', 'FAMILY_NEWS', 'CORRECTION');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PENDING_REVIEW', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportFormat" AS ENUM ('GEDCOM551', 'GEDCOM70', 'CSV', 'JSON');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('GEDCOM551', 'GEDCOM70', 'CSV', 'JSON', 'PDF', 'PNG', 'SVG');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "avatar_file_id" UUID,
    "bio" VARCHAR(1000),
    "surname" VARCHAR(20),
    "location" VARCHAR(200),
    "privacy_settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(500),
    "ip_hash" VARCHAR(64),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_code" VARCHAR(100) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_code" VARCHAR(100) NOT NULL,
    "granted_by" UUID,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surnames" (
    "id" UUID NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "pinyin" VARCHAR(100) NOT NULL,
    "pinyin_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "traditional" VARCHAR(20),
    "category" "SurnameCategory" NOT NULL DEFAULT 'SINGLE',
    "popularity_rank" INTEGER,
    "origin_summary" VARCHAR(2000),
    "credibility" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "surnames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surname_origins" (
    "id" UUID NOT NULL,
    "surname_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "era" VARCHAR(100),
    "evidence_level" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "surname_origins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surname_variants" (
    "id" UUID NOT NULL,
    "surname_id" UUID NOT NULL,
    "variant" VARCHAR(50) NOT NULL,
    "variant_type" VARCHAR(50) NOT NULL DEFAULT '异体字',
    "note" VARCHAR(500),
    "source_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surname_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surname_hall_names" (
    "id" UUID NOT NULL,
    "surname_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "origin" VARCHAR(1000),
    "location" VARCHAR(200),
    "source_id" UUID,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "surname_hall_names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surname_commanderies" (
    "id" UUID NOT NULL,
    "surname_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "historical_place" VARCHAR(200),
    "modern_place" VARCHAR(200),
    "source_id" UUID,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "surname_commanderies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_figures" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "surname_id" UUID,
    "courtesy_name" VARCHAR(100),
    "dynasty" VARCHAR(100),
    "birth_year" INTEGER,
    "death_year" INTEGER,
    "birthplace" VARCHAR(200),
    "biography" TEXT,
    "achievements" TEXT,
    "evidence_level" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "historical_figures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "dynasty" VARCHAR(100),
    "year_text" VARCHAR(100),
    "year_value" INTEGER,
    "description" TEXT,
    "surname_id" UUID,
    "place_id" UUID,
    "evidence_level" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "historical_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_places" (
    "id" UUID NOT NULL,
    "historical_name" VARCHAR(200) NOT NULL,
    "modern_name" VARCHAR(200),
    "place_type" "PlaceType" NOT NULL DEFAULT 'SITE',
    "division_id" UUID,
    "longitude" DECIMAL(10,6),
    "latitude" DECIMAL(10,6),
    "evidence_level" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "source_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "historical_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_aliases" (
    "id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "alias" VARCHAR(200) NOT NULL,
    "era" VARCHAR(100),
    "source" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrative_divisions" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(30),
    "level" "PlaceType" NOT NULL,
    "parent_id" UUID,
    "dynasty" VARCHAR(100),
    "period_start" INTEGER,
    "period_end" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_records" (
    "id" UUID NOT NULL,
    "surname_id" UUID,
    "family_id" UUID,
    "from_place_id" UUID,
    "to_place_id" UUID,
    "dynasty" VARCHAR(100),
    "start_year" INTEGER,
    "end_year" INTEGER,
    "reason" VARCHAR(500),
    "narrative" TEXT,
    "route_points" JSONB NOT NULL DEFAULT '[]',
    "evidence_level" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "migration_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_sources" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "author" VARCHAR(200),
    "edition" VARCHAR(200),
    "publisher" VARCHAR(200),
    "publish_year" INTEGER,
    "volume_or_page" VARCHAR(200),
    "original_quote" TEXT,
    "digital_url" VARCHAR(1000),
    "source_type" "SourceType" NOT NULL DEFAULT 'OTHER',
    "credibility" "SourceCredibility" NOT NULL DEFAULT 'UNRATED',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "entered_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "historical_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_citations" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "page_or_volume" VARCHAR(200),
    "quote" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_citations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_figure_places" (
    "id" UUID NOT NULL,
    "figure_id" UUID NOT NULL,
    "place_id" UUID NOT NULL,
    "activity" VARCHAR(200),
    "source_id" UUID,

    CONSTRAINT "historical_figure_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "families" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "surname_id" UUID,
    "surname_text" VARCHAR(20) NOT NULL,
    "founder_name" VARCHAR(100),
    "ancestral_home" VARCHAR(300),
    "description" TEXT,
    "hall_name" VARCHAR(100),
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "owner_id" UUID NOT NULL,
    "cover_file_id" UUID,
    "avatar_file_id" UUID,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "surname_text" VARCHAR(20) NOT NULL,
    "given_name" VARCHAR(100) NOT NULL,
    "courtesy_name" VARCHAR(100),
    "alias" VARCHAR(200),
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "birth_date_text" VARCHAR(100),
    "birth_year" INTEGER,
    "birth_precision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "death_date_text" VARCHAR(100),
    "death_year" INTEGER,
    "death_precision" "DatePrecision" NOT NULL DEFAULT 'UNKNOWN',
    "is_living" BOOLEAN NOT NULL DEFAULT true,
    "birth_place_id" UUID,
    "ancestral_home_id" UUID,
    "biography" TEXT,
    "generation_number" INTEGER,
    "generation_char" VARCHAR(10),
    "generation_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "branch_id" UUID,
    "avatar_file_id" UUID,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "sensitive_data_encrypted" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_relationships" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "from_person_id" UUID NOT NULL,
    "to_person_id" UUID NOT NULL,
    "type" "RelationType" NOT NULL,
    "subtype" "RelationSubtype" NOT NULL DEFAULT 'BIOLOGICAL',
    "directional" BOOLEAN NOT NULL DEFAULT true,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "evidence_level" "EvidenceLevel" NOT NULL DEFAULT 'UNVERIFIED',
    "start_date_text" VARCHAR(100),
    "end_date_text" VARCHAR(100),
    "marriage_order" INTEGER,
    "notes" TEXT,
    "source_id" UUID,
    "document_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "family_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_branches" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "parent_id" UUID,
    "root_person_id" UUID,
    "description" TEXT,
    "color" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "family_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_generations" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "generation_number" INTEGER NOT NULL,
    "generation_char" VARCHAR(10),
    "poem_line" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_poems" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "branch_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "characters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_text" VARCHAR(1000),
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "generation_poems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_events" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "date_text" VARCHAR(100),
    "year_value" INTEGER,
    "place_id" UUID,
    "description" TEXT,
    "source_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "family_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_collaborators" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" "FamilyPermissionCode" NOT NULL DEFAULT 'VIEWER',
    "status" "CollaboratorStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by" UUID,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_invitations" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "permission" "FamilyPermissionCode" NOT NULL DEFAULT 'VIEWER',
    "invited_by_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_permissions" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "subject_type" VARCHAR(20) NOT NULL,
    "subject_id" UUID NOT NULL,
    "resource_type" VARCHAR(50) NOT NULL,
    "resource_id" UUID,
    "can_read" BOOLEAN NOT NULL DEFAULT true,
    "can_write" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genealogy_versions" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "label" VARCHAR(200),
    "change_summary" TEXT,
    "snapshot" JSONB NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genealogy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_documents" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
    "file_name" VARCHAR(300) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "description" TEXT,
    "ocr_text" TEXT,
    "ocr_status" "OcrStatus" NOT NULL DEFAULT 'NONE',
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "family_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "change_note" VARCHAR(500),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_person_links" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "link_type" VARCHAR(50) NOT NULL DEFAULT 'MENTION',
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_person_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sources" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "source_id" UUID,
    "citation_text" TEXT,
    "verification" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "family_id" UUID,
    "surname_id" UUID,
    "type" "PostType" NOT NULL DEFAULT 'DISCUSSION',
    "title" VARCHAR(300) NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clues" JSONB NOT NULL DEFAULT '{}',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "content" VARCHAR(5000) NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "content" VARCHAR(5000) NOT NULL,
    "read_at" TIMESTAMP(3),
    "deleted_by_sender" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by_recipient" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "addressee_id" UUID NOT NULL,
    "family_a_id" UUID,
    "family_b_id" UUID,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "evidence_document_id" UUID,
    "evidence_note" TEXT,
    "requester_confirmed_at" TIMESTAMP(3),
    "addressee_confirmed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "handled_by_id" UUID,
    "resolution" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip_hash" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(500),
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "search_records" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "query" VARCHAR(300) NOT NULL,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "format" "ImportFormat" NOT NULL,
    "file_name" VARCHAR(300),
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "report" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "storage_key" VARCHAR(500),
    "options" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "user_sessions_token_hash_idx" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_code_key" ON "role_permissions"("role_id", "permission_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_user_id_permission_code_key" ON "user_permissions"("user_id", "permission_code");

-- CreateIndex
CREATE UNIQUE INDEX "surnames_name_key" ON "surnames"("name");

-- CreateIndex
CREATE INDEX "surnames_pinyin_idx" ON "surnames"("pinyin");

-- CreateIndex
CREATE INDEX "surnames_popularity_rank_idx" ON "surnames"("popularity_rank");

-- CreateIndex
CREATE INDEX "surnames_review_status_idx" ON "surnames"("review_status");

-- CreateIndex
CREATE INDEX "surname_origins_surname_id_review_status_idx" ON "surname_origins"("surname_id", "review_status");

-- CreateIndex
CREATE INDEX "surname_variants_variant_idx" ON "surname_variants"("variant");

-- CreateIndex
CREATE UNIQUE INDEX "surname_variants_surname_id_variant_key" ON "surname_variants"("surname_id", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "surname_hall_names_surname_id_name_key" ON "surname_hall_names"("surname_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "surname_commanderies_surname_id_name_key" ON "surname_commanderies"("surname_id", "name");

-- CreateIndex
CREATE INDEX "historical_figures_surname_id_dynasty_idx" ON "historical_figures"("surname_id", "dynasty");

-- CreateIndex
CREATE INDEX "historical_figures_name_idx" ON "historical_figures"("name");

-- CreateIndex
CREATE INDEX "historical_events_surname_id_year_value_idx" ON "historical_events"("surname_id", "year_value");

-- CreateIndex
CREATE INDEX "historical_places_historical_name_idx" ON "historical_places"("historical_name");

-- CreateIndex
CREATE INDEX "historical_places_modern_name_idx" ON "historical_places"("modern_name");

-- CreateIndex
CREATE INDEX "place_aliases_alias_idx" ON "place_aliases"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "place_aliases_place_id_alias_key" ON "place_aliases"("place_id", "alias");

-- CreateIndex
CREATE INDEX "administrative_divisions_name_level_idx" ON "administrative_divisions"("name", "level");

-- CreateIndex
CREATE INDEX "administrative_divisions_parent_id_idx" ON "administrative_divisions"("parent_id");

-- CreateIndex
CREATE INDEX "migration_records_surname_id_start_year_idx" ON "migration_records"("surname_id", "start_year");

-- CreateIndex
CREATE INDEX "migration_records_family_id_start_year_idx" ON "migration_records"("family_id", "start_year");

-- CreateIndex
CREATE INDEX "historical_sources_title_idx" ON "historical_sources"("title");

-- CreateIndex
CREATE INDEX "historical_sources_review_status_source_type_idx" ON "historical_sources"("review_status", "source_type");

-- CreateIndex
CREATE INDEX "source_citations_entity_type_entity_id_idx" ON "source_citations"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "historical_figure_places_figure_id_place_id_activity_key" ON "historical_figure_places"("figure_id", "place_id", "activity");

-- CreateIndex
CREATE INDEX "families_owner_id_idx" ON "families"("owner_id");

-- CreateIndex
CREATE INDEX "families_visibility_created_at_idx" ON "families"("visibility", "created_at");

-- CreateIndex
CREATE INDEX "families_surname_id_idx" ON "families"("surname_id");

-- CreateIndex
CREATE INDEX "family_members_family_id_deleted_at_idx" ON "family_members"("family_id", "deleted_at");

-- CreateIndex
CREATE INDEX "family_members_family_id_generation_number_idx" ON "family_members"("family_id", "generation_number");

-- CreateIndex
CREATE INDEX "family_members_family_id_birth_year_idx" ON "family_members"("family_id", "birth_year");

-- CreateIndex
CREATE INDEX "family_members_given_name_idx" ON "family_members"("given_name");

-- CreateIndex
CREATE INDEX "family_relationships_family_id_type_verification_idx" ON "family_relationships"("family_id", "type", "verification");

-- CreateIndex
CREATE INDEX "family_relationships_from_person_id_type_idx" ON "family_relationships"("from_person_id", "type");

-- CreateIndex
CREATE INDEX "family_relationships_to_person_id_type_idx" ON "family_relationships"("to_person_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "family_relationships_from_person_id_to_person_id_type_subty_key" ON "family_relationships"("from_person_id", "to_person_id", "type", "subtype", "deleted_at");

-- CreateIndex
CREATE INDEX "family_branches_family_id_parent_id_idx" ON "family_branches"("family_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_generations_family_id_generation_number_key" ON "family_generations"("family_id", "generation_number");

-- CreateIndex
CREATE INDEX "generation_poems_family_id_branch_id_idx" ON "generation_poems"("family_id", "branch_id");

-- CreateIndex
CREATE INDEX "family_events_family_id_year_value_idx" ON "family_events"("family_id", "year_value");

-- CreateIndex
CREATE INDEX "family_collaborators_user_id_status_idx" ON "family_collaborators"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "family_collaborators_family_id_user_id_key" ON "family_collaborators"("family_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "family_invitations_token_hash_key" ON "family_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "family_invitations_email_expires_at_idx" ON "family_invitations"("email", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "family_permissions_family_id_subject_type_subject_id_resour_key" ON "family_permissions"("family_id", "subject_type", "subject_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "genealogy_versions_family_id_created_at_idx" ON "genealogy_versions"("family_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "genealogy_versions_family_id_version_number_key" ON "genealogy_versions"("family_id", "version_number");

-- CreateIndex
CREATE INDEX "family_documents_family_id_category_deleted_at_idx" ON "family_documents"("family_id", "category", "deleted_at");

-- CreateIndex
CREATE INDEX "family_documents_checksum_idx" ON "family_documents"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_person_links_document_id_person_id_link_type_key" ON "document_person_links"("document_id", "person_id", "link_type");

-- CreateIndex
CREATE INDEX "posts_type_status_created_at_idx" ON "posts"("type", "status", "created_at");

-- CreateIndex
CREATE INDEX "posts_surname_id_type_idx" ON "posts"("surname_id", "type");

-- CreateIndex
CREATE INDEX "posts_family_id_created_at_idx" ON "posts"("family_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_created_at_idx" ON "messages"("sender_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_recipient_id_read_at_idx" ON "messages"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "friendships_status_created_at_idx" ON "friendships"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_requester_id_addressee_id_family_a_id_family_b__key" ON "friendships"("requester_id", "addressee_id", "family_a_id", "family_b_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "search_records_user_id_created_at_idx" ON "search_records"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "import_jobs_family_id_created_at_idx" ON "import_jobs"("family_id", "created_at");

-- CreateIndex
CREATE INDEX "export_jobs_family_id_created_at_idx" ON "export_jobs"("family_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surname_origins" ADD CONSTRAINT "surname_origins_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surname_origins" ADD CONSTRAINT "surname_origins_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "historical_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surname_variants" ADD CONSTRAINT "surname_variants_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surname_hall_names" ADD CONSTRAINT "surname_hall_names_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surname_commanderies" ADD CONSTRAINT "surname_commanderies_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_figures" ADD CONSTRAINT "historical_figures_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_figures" ADD CONSTRAINT "historical_figures_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "historical_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_events" ADD CONSTRAINT "historical_events_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_events" ADD CONSTRAINT "historical_events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "historical_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_places" ADD CONSTRAINT "historical_places_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_aliases" ADD CONSTRAINT "place_aliases_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "historical_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrative_divisions" ADD CONSTRAINT "administrative_divisions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "administrative_divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_records" ADD CONSTRAINT "migration_records_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_records" ADD CONSTRAINT "migration_records_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_records" ADD CONSTRAINT "migration_records_from_place_id_fkey" FOREIGN KEY ("from_place_id") REFERENCES "historical_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_records" ADD CONSTRAINT "migration_records_to_place_id_fkey" FOREIGN KEY ("to_place_id") REFERENCES "historical_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_records" ADD CONSTRAINT "migration_records_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "historical_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_sources" ADD CONSTRAINT "historical_sources_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_citations" ADD CONSTRAINT "source_citations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "historical_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_citations" ADD CONSTRAINT "source_citations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_figure_places" ADD CONSTRAINT "historical_figure_places_figure_id_fkey" FOREIGN KEY ("figure_id") REFERENCES "historical_figures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_figure_places" ADD CONSTRAINT "historical_figure_places_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "historical_places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "families" ADD CONSTRAINT "families_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "family_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_birth_place_id_fkey" FOREIGN KEY ("birth_place_id") REFERENCES "historical_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_ancestral_home_id_fkey" FOREIGN KEY ("ancestral_home_id") REFERENCES "historical_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_from_person_id_fkey" FOREIGN KEY ("from_person_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_to_person_id_fkey" FOREIGN KEY ("to_person_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_relationships" ADD CONSTRAINT "family_relationships_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "family_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_branches" ADD CONSTRAINT "family_branches_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_branches" ADD CONSTRAINT "family_branches_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "family_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_branches" ADD CONSTRAINT "family_branches_root_person_id_fkey" FOREIGN KEY ("root_person_id") REFERENCES "family_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_generations" ADD CONSTRAINT "family_generations_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_poems" ADD CONSTRAINT "generation_poems_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_poems" ADD CONSTRAINT "generation_poems_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "family_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "historical_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_collaborators" ADD CONSTRAINT "family_collaborators_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_collaborators" ADD CONSTRAINT "family_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_invitations" ADD CONSTRAINT "family_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_permissions" ADD CONSTRAINT "family_permissions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genealogy_versions" ADD CONSTRAINT "genealogy_versions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genealogy_versions" ADD CONSTRAINT "genealogy_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_documents" ADD CONSTRAINT "family_documents_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_documents" ADD CONSTRAINT "family_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "family_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_person_links" ADD CONSTRAINT "document_person_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "family_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_person_links" ADD CONSTRAINT "document_person_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sources" ADD CONSTRAINT "document_sources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "family_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_surname_id_fkey" FOREIGN KEY ("surname_id") REFERENCES "surnames"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_fkey" FOREIGN KEY ("addressee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_family_a_id_fkey" FOREIGN KEY ("family_a_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_family_b_id_fkey" FOREIGN KEY ("family_b_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_records" ADD CONSTRAINT "search_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
